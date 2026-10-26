import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, ShieldCheck, Film, UserRound, AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * Video to avatar.
 *
 * Upload a video, let a vision model read it, derive an avatar, and plan a NEW original
 * video starring that avatar.
 *
 * The screen is built around one rule: never show a description, a face or a scene that did
 * not come from a real model reading real frames. When the model is not configured, or the
 * video cannot be read, the screen says exactly that and stops — it does not fill the space
 * with something plausible.
 */
/** The shape the analyse procedure returns. Mirrors the server's PipelineResult. */
type Probe = {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  hasAudio: boolean;
  sizeBytes: number;
};
type Avatar = {
  appearance: string;
  wardrobe: string[];
  distinguishing: string[];
  consistencyPrompt: string;
  derivedFrom: { framesAnalysed: number; model: string };
};
type Plan = {
  title: string;
  logline: string;
  scenes: Array<{ index: number; durationSeconds: number; action: string; camera: string }>;
  totalDurationSeconds: number;
  originalityNote: string;
};
type AnalysisResult =
  | { status: "planned"; probe: Probe; avatar: Avatar; plan: Plan; model: string }
  | { status: "stopped"; stage: string; reason: string; probe?: Probe; framesAnalysed: number };

export default function AvatarVideo() {
  const requirements = trpc.avatarVideo.requirements.useQuery();
  const [relativePath, setRelativePath] = useState("");
  const [consentAffirmed, setConsentAffirmed] = useState(false);
  const [consentBasis, setConsentBasis] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyse = trpc.avatarVideo.analyse.useMutation();

  async function runAnalysis() {
    return analyse.mutateAsync({
      relativePath: relativePath.trim(),
      consentAffirmed,
      consentBasis: consentBasis.trim(),
      frameCount: 8,
    });
  }

  const canAnalyse =
    relativePath.trim().length > 0 && consentAffirmed && consentBasis.trim().length >= 3 && !analyse.isPending;

  const visionReady = requirements.data?.visionModelConfigured ?? false;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);
    try {
      const outcome = await runAnalysis();
      setResult(outcome as unknown as AnalysisResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The analysis could not be started.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Video to avatar</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Upload a video. A vision model reads it, builds an avatar from the person in it, and plans a new
          original video starring that avatar. The plan is newly written — it borrows the person's appearance
          and style, and deliberately does not reproduce the original's shots or audio.
        </p>
      </header>

      {/* Honest readiness, before the user does any work. */}
      {requirements.isSuccess && !visionReady && (
        <div className="gx-panel mb-6 flex gap-3 border-l-2 border-amber-500/60 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="text-sm">
            <p className="font-medium">No vision model is configured, so analysis is unavailable.</p>
            <p className="mt-1 text-muted-foreground">{requirements.data.visionModelHint}</p>
            <p className="mt-1 text-muted-foreground">
              You can still fill this in and press Analyse — it will tell you precisely what is missing rather
              than inventing a description.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="gx-panel space-y-5 p-5">
        <div>
          <label htmlFor="video" className="mb-1.5 block text-sm font-medium">
            Video in the media directory
          </label>
          <Input
            id="video"
            value={relativePath}
            onChange={(event) => setRelativePath(event.target.value)}
            placeholder="e.g. uploads/my-clip.mp4"
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            The file is read from the app's media folder. Paths outside it are refused.
          </p>
        </div>

        {/* Consent gate. The engine enforces this too; the UI must not hide it. */}
        <div className="rounded-lg border border-border/60 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="flex-1">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={consentAffirmed}
                  onChange={(event) => setConsentAffirmed(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
                />
                <span>{requirements.data?.consentText ?? "I have the right to use this person's likeness."}</span>
              </label>

              <div className="mt-3">
                <label htmlFor="basis" className="mb-1 block text-xs text-muted-foreground">
                  Basis for that right
                </label>
                <Input
                  id="basis"
                  value={consentBasis}
                  onChange={(event) => setConsentBasis(event.target.value)}
                  placeholder="It is me, or: I hold signed permission dated …"
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                This is recorded with the request. Creating new footage of someone who has not agreed is the
                defining harm in this kind of tool, so it is required rather than optional.
              </p>
            </div>
          </div>
        </div>

        <Button type="submit" disabled={!canAnalyse}>
          {analyse.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          {analyse.isPending ? "Reading the video…" : "Analyse and plan"}
        </Button>

        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-300">{error}</div>
        )}
      </form>

      {result && <ResultPanel result={result} />}
    </div>
  );
}

function ResultPanel({ result }: { result: AnalysisResult }) {
  const probe = result.status === "planned" ? result.probe : result.probe;

  // Stopped early: name the stage and the reason, and show whatever was actually read.
  if (result.status === "stopped") {
    return (
      <section className="mt-6 space-y-4">
        <div className="gx-panel border-l-2 border-amber-500/60 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="text-sm">
              <p className="font-medium">
                Stopped at <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{result.stage}</code>
              </p>
              <p className="mt-1.5 text-muted-foreground">{result.reason}</p>
              {result.framesAnalysed > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">{result.framesAnalysed} frame(s) were read.</p>
              )}
            </div>
          </div>
        </div>
        {probe && <ProbeCard probe={probe} />}
      </section>
    );
  }

  return (
    <section className="mt-6 space-y-4">
      <div className="gx-panel flex items-start gap-3 border-l-2 border-emerald-500/60 p-4">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
        <div className="text-sm">
          <p className="font-medium">Analysis complete</p>
          <p className="mt-1 text-muted-foreground">
            Read by <code className="rounded bg-muted px-1 py-0.5 text-xs">{result.model}</code> across{" "}
            {result.avatar.derivedFrom.framesAnalysed} frame(s).
          </p>
        </div>
      </div>

      <ProbeCard probe={result.probe} />
      <AvatarCard avatar={result.avatar} />
      <PlanCard plan={result.plan} />
    </section>
  );
}

function ProbeCard({ probe }: { probe: Probe }) {
  const rows = useMemo(
    () => [
      ["Duration", `${probe.durationSeconds.toFixed(2)} s`],
      ["Resolution", `${probe.width} × ${probe.height}`],
      ["Frame rate", `${probe.fps} fps`],
      ["Codec", probe.codec],
      ["Audio", probe.hasAudio ? "present" : "none"],
      ["Size", `${(probe.sizeBytes / 1024 ** 2).toFixed(1)} MB`],
    ],
    [probe],
  );

  return (
    <div className="gx-panel p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Film className="h-4 w-4 text-primary" /> Source video
      </h2>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-mono text-xs">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function AvatarCard({ avatar }: { avatar: Avatar }) {
  return (
    <div className="gx-panel p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
        <UserRound className="h-4 w-4 text-primary" /> Avatar derived from the video
      </h2>
      <p className="text-sm">{avatar.appearance}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {avatar.distinguishing.map((item) => (
          <Badge key={item} variant="secondary" className="text-xs">
            {item}
          </Badge>
        ))}
        {avatar.wardrobe.map((item) => (
          <Badge key={item} variant="outline" className="text-xs">
            {item}
          </Badge>
        ))}
      </div>

      <div className="mt-4">
        <p className="mb-1 text-xs text-muted-foreground">
          Consistency prompt — this is what keeps the face and wardrobe identical in every scene
        </p>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-xs">
          {avatar.consistencyPrompt}
        </pre>
      </div>
    </div>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <div className="gx-panel p-4">
      <h2 className="mb-1 text-sm font-medium">New original video</h2>
      <p className="text-sm text-muted-foreground">{plan.logline}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {plan.scenes.length} scenes · {plan.totalDurationSeconds} s
      </p>

      <ol className="mt-4 space-y-2">
        {plan.scenes.map((scene) => (
          <li key={scene.index} className="rounded-md border border-border/50 p-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium text-primary">Scene {scene.index}</span>
              <span className="text-xs text-muted-foreground">
                {scene.durationSeconds}s · {scene.camera}
              </span>
            </div>
            <p className="mt-1 text-sm">{scene.action}</p>
          </li>
        ))}
      </ol>

      <p className="mt-4 rounded-md border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground">
        {plan.originalityNote}
      </p>
    </div>
  );
}
