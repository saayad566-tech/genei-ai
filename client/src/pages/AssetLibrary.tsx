import React, { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Archive, Search, Filter, Upload, Download, Trash2, Grid3X3,
  LayoutList, Image, Music, Video, FileText, HardDrive,
  Plus, RefreshCw, Eye, Copy, Loader2
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const assetTypeIcons: Record<string, React.ElementType> = {
  image: Image,
  audio: Music,
  video: Video,
  document: FileText,
};

const assetTypeColors: Record<string, string> = {
  image: "oklch(0.72 0.18 210)",
  audio: "oklch(0.65 0.22 285)",
  video: "oklch(0.60 0.25 310)",
  document: "oklch(0.78 0.18 75)",
};

const filterTypes = ["All", "Images", "Audio", "Video", "Documents"];

export default function AssetLibrary() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("All");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedAssets, setSelectedAssets] = useState<number[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: assets, isLoading, refetch } = trpc.assets.list.useQuery();
  const uploadAssetMutation = trpc.assets.upload.useMutation();
  const deleteAssetMutation = trpc.assets.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Asset deleted"); },
    onError: () => toast.error("Failed to delete asset"),
  });

  const filteredAssets = assets?.filter(asset => {
    const matchesSearch = asset.name.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === "All" ||
      (filterType === "Images" && asset.type === "image") ||
      (filterType === "Audio" && asset.type === "audio") ||
      (filterType === "Video" && asset.type === "video") ||
      (filterType === "Documents" && asset.type === "document");
    return matchesSearch && matchesType;
  }) ?? [];

  const toggleSelect = (id: number) => {
    setSelectedAssets(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Files must be 25 MB or smaller");
      return;
    }

    const assetType = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("audio/")
        ? "audio"
        : file.type.startsWith("video/")
          ? "video"
          : "document";

    setIsUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Unable to read the selected file"));
        reader.readAsDataURL(file);
      });
      await uploadAssetMutation.mutateAsync({
        name: file.name,
        type: assetType,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        data: dataUrl,
      });
      await refetch();
      toast.success(`${file.name} uploaded to Asset Library`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const totalSize = assets?.reduce((acc, a) => acc + (a.size || 0), 0) ?? 0;

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, oklch(0.72 0.18 210), oklch(0.68 0.20 155))", boxShadow: "0 0 20px oklch(0.72 0.18 210 / 0.4)" }}>
            <Archive className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display genei-gradient-text-cyan">Asset Library</h1>
            <p className="text-xs text-muted-foreground">Cloud storage for all your creations</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input ref={fileInputRef} type="file" className="hidden" accept="image/*,audio/*,video/*,.pdf,.txt,.md,.json,.zip" onChange={handleFileChange} />
          <button type="button" onClick={handleUpload} disabled={isUploading}
            className="genei-btn-primary flex min-h-11 items-center gap-2 text-sm py-2 px-4 disabled:cursor-not-allowed disabled:opacity-50">
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {isUploading ? "Uploading..." : "Upload"}
          </button>
        </div>
      </div>

      {/* Storage Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Assets", value: assets?.length ?? 0, icon: Archive, color: "oklch(0.72 0.18 210)" },
          { label: "Images", value: assets?.filter(a => a.type === "image").length ?? 0, icon: Image, color: "oklch(0.65 0.22 285)" },
          { label: "Audio Files", value: assets?.filter(a => a.type === "audio").length ?? 0, icon: Music, color: "oklch(0.60 0.25 310)" },
          { label: "Storage Used", value: formatSize(totalSize), icon: HardDrive, color: "oklch(0.78 0.18 75)" },
        ].map((stat) => (
          <div key={stat.label} className="genei-card p-4 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: `${stat.color} / 0.15` }}>
                <stat.icon className="w-4 h-4" style={{ color: stat.color }} />
              </div>
              <div>
                <div className="text-lg font-bold font-display text-foreground">{stat.value}</div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assets..."
            className="w-full pl-9 pr-4 py-2 genei-input text-sm" />
        </div>

        <div className="flex gap-1">
          {filterTypes.map((type) => (
            <button key={type} onClick={() => setFilterType(type)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${filterType === type ? "text-white" : "border border-border text-muted-foreground hover:text-foreground"}`}
              style={filterType === type ? { background: "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.60 0.25 310))" } : {}}>
              {type}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {selectedAssets.length > 0 && (
            <button onClick={() => { selectedAssets.forEach(id => deleteAssetMutation.mutate({ id })); setSelectedAssets([]); }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-destructive border border-destructive/30 hover:bg-destructive/10 transition-all">
              <Trash2 className="w-3.5 h-3.5" /> Delete ({selectedAssets.length})
            </button>
          )}
          <button onClick={() => refetch()} className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setViewMode("grid")} className={`p-2 rounded-lg ${viewMode === "grid" ? "text-primary" : "text-muted-foreground"}`}>
            <Grid3X3 className="w-4 h-4" />
          </button>
          <button onClick={() => setViewMode("list")} className={`p-2 rounded-lg ${viewMode === "list" ? "text-primary" : "text-muted-foreground"}`}>
            <LayoutList className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Assets Grid/List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: "oklch(0.65 0.22 285 / 0.1)", border: "1px dashed oklch(0.65 0.22 285 / 0.3)" }}>
            <Archive className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">No assets yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Generate images, music, or videos to see them here</p>
          <button type="button" onClick={handleUpload} disabled={isUploading} className="genei-btn-primary flex min-h-11 items-center gap-2 text-sm disabled:opacity-50">
            <Plus className="w-4 h-4" /> Upload First Asset
          </button>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredAssets.map((asset, i) => {
            const Icon = assetTypeIcons[asset.type] || FileText;
            const color = assetTypeColors[asset.type] || "oklch(0.65 0.22 285)";
            const isSelected = selectedAssets.includes(asset.id);
            return (
              <motion.div key={asset.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }}>
                <div
                  className={`genei-card rounded-xl overflow-hidden cursor-pointer transition-all group ${isSelected ? "border-primary/60" : "hover:border-primary/30"}`}
                  onClick={() => toggleSelect(asset.id)}
                  style={isSelected ? { boxShadow: "0 0 16px oklch(0.65 0.22 285 / 0.3)" } : {}}
                >
                  <div className="aspect-square relative flex items-center justify-center"
                    style={{ background: `linear-gradient(135deg, ${color} / 0.15, oklch(0.10 0.01 265))` }}>
                    {asset.type === "image" && asset.storageUrl ? (
                      <img src={asset.storageUrl} alt={asset.name} className="w-full h-full object-cover" />
                    ) : (
                      <Icon className="w-10 h-10" style={{ color }} />
                    )}
                    {isSelected && (
                      <div className="absolute inset-0 flex items-center justify-center" style={{ background: "oklch(0.65 0.22 285 / 0.3)" }}>
                        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                          <span className="text-white text-xs">✓</span>
                        </div>
                      </div>
                    )}
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); window.open(asset.storageUrl, "_blank"); }}
                        className="p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors">
                        <Eye className="w-3 h-3" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(asset.storageUrl); toast.success("URL copied!"); }}
                        className="p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors">
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="p-2.5">
                    <div className="text-xs font-medium text-foreground truncate">{asset.name}</div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-muted-foreground capitalize">{asset.type}</span>
                      <span className="text-[10px] text-muted-foreground">{formatSize(asset.size || 0)}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="genei-card rounded-xl overflow-hidden">
          {filteredAssets.map((asset, i) => {
            const Icon = assetTypeIcons[asset.type] || FileText;
            const color = assetTypeColors[asset.type] || "oklch(0.65 0.22 285)";
            return (
              <div key={asset.id} className={`flex items-center gap-4 px-4 py-3 hover:bg-secondary/20 transition-colors cursor-pointer ${i < filteredAssets.length - 1 ? "border-b border-border" : ""}`}
                onClick={() => toggleSelect(asset.id)}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${color} / 0.15` }}>
                  {asset.type === "image" && asset.storageUrl
                    ? <img src={asset.storageUrl} alt={asset.name} className="w-full h-full rounded-xl object-cover" />
                    : <Icon className="w-5 h-5" style={{ color }} />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{asset.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{asset.prompt || "No prompt"}</div>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-shrink-0">
                  <span className="capitalize">{asset.type}</span>
                  <span>{formatSize(asset.size || 0)}</span>
                  <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
                  <div className="flex gap-1">
                    <button onClick={(e) => { e.stopPropagation(); window.open(asset.storageUrl, "_blank"); }}
                      className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteAssetMutation.mutate({ id: asset.id }); }}
                      className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
