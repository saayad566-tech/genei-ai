import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Mic, AlertTriangle, Trash2, Volume2, Clock } from "lucide-react";

/**
 * Voice studio.
 *
 * Voice profiles, speech synthesis and timed dubbing.
 *
 * The screen states plainly when no speech engine is configured, before the user writes
 * anything — and the synthesise action reports the engine's own requirement rather than
 * producing silence and calling it audio.
 */
export default function VoiceStudio() {
  const status = trpc.voice.status.useQuery();
  const voices = trpc.voice.list.useQuery();
  const saveVoice = trpc.voice.save.useMutation();
  const removeVoice = trpc.voice.remove.useMutation();
  const speak = trpc.voice.speak.useMutation();
  const planDub = trpc.voice.planDub.useMutation();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState("en");
  const [text, setText] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const [totalSeconds, setTotalSeconds] = useState("30");
  const [segments, setSegments] = useState("0|First line of the dub.\n8|Second line.");
  const [dub, setDub] = useState<{ lines: Array<{ index: number; startSeconds: number; endSeconds: number; text: string; estimatedSeconds: number; rate: number | null; fits: boolean }>; overflow: number[]; note: string } | null>(null);

  const engineReady = status.data?.available ?? false;

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    setNote(null);
    try {
      await saveVoice.mutateAsync({ name, description, kind: "designed", language });
      setNote(`Saved "${name}".`);
      setName("");
      setDescription("");
      await voices.refetch();
    } catch (cause) {
      setNote(cause instanceof Error ? cause.message : "Could not save the voice.");
    }
  }

  async function onSpeak() {
    setNote(null);
    try {
      const outcome = await speak.mutateAsync({ text, voiceId, outName: `line-${Date.now()}.mp3` });
      setNote(
        outcome.status === "ok"
          ? `Wrote ${outcome.bytes} bytes via ${outcome.engine}.`
          : outcome.reason,
      );
    } catch (cause) {
      setNote(cause instanceof Error ? cause.message : "Synthesis failed.");
    }
  }

  async function onPlanDub() {
    setNote(null);
    try {
      const parsed = segments
        .split("\n")
        .map((line) => line.split("|"))
        .filter((parts) => parts.length === 2 && parts[1].trim())
        .map((parts) => ({ startSeconds: Number(parts[0]) || 0, text: parts[1].trim() }));
      if (parsed.length === 0) {
        setNote("Add at least one line as: startSeconds|text");
        return;
      }
      const result = await planDub.mutateAsync({ totalSeconds: Number(totalSeconds) || 0, segments: parsed });
      setDub(result);
    } catch (cause) {
      setNote(cause instanceof Error ? cause.message : "Could not plan the dub.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Voice studio</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Voice profiles, speech synthesis and timed dubbing. Voices are stored locally; nothing is sent
          anywhere except the speech engine you configure.
        </p>
      </header>

      {status.isSuccess && !engineReady && (
        <div className="gx-panel mb-6 flex gap-3 border-l-2 border-amber-500/60 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="text-sm">
            <p className="font-medium">No speech engine is configured, so synthesis is unavailable.</p>
            <p className="mt-1 text-muted-foreground">{status.data?.requirement}</p>
            <p className="mt-1 text-muted-foreground">
              You can still create voices and plan a dub — the plan is pure timing and needs no engine.
            </p>
          </div>
        </div>
      )}

      {/* Voice library */}
      <section className="gx-panel mb-6 p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Mic className="h-4 w-4 text-primary" /> Voices
        </h2>

        <form onSubmit={onSave} className="grid gap-3 sm:grid-cols-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="warm low male, slow delivery" />
          <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="en" />
          <Button type="submit" disabled={saveVoice.isPending || !name.trim()} className="sm:col-span-3">
            {saveVoice.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save voice
          </Button>
        </form>

        <ul className="mt-4 space-y-1.5">
          {(voices.data ?? []).map((voice) => (
            <li key={voice.id} className="flex items-center justify-between gap-2 rounded-md border border-border/50 px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{voice.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {voice.kind} · {voice.language} · {voice.description || "no description"}
                </span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${voice.name}`}
                onClick={async () => {
                  await removeVoice.mutateAsync({ id: voice.id });
                  await voices.refetch();
                }}
                className="text-muted-foreground hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
          {voices.isSuccess && (voices.data ?? []).length === 0 && (
            <li className="text-xs text-muted-foreground">No voices yet. Save one above.</li>
          )}
        </ul>
      </section>

      {/* Synthesis */}
      <section className="gx-panel mb-6 p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Volume2 className="h-4 w-4 text-primary" /> Speak a line
        </h2>
        <div className="grid gap-3">
          <select
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Choose a voice</option>
            {(voices.data ?? []).map((voice) => (
              <option key={voice.id} value={voice.id}>{voice.name}</option>
            ))}
          </select>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="The line to speak"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <Button onClick={onSpeak} disabled={speak.isPending || !text.trim() || !voiceId}>
            {speak.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Synthesise
          </Button>
        </div>
      </section>

      {/* Dubbing */}
      <section className="gx-panel p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Clock className="h-4 w-4 text-primary" /> Plan a dub
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          One line per row as <code className="rounded bg-muted px-1">startSeconds|text</code>. The plan fits each
          line into the gap before the next one and reports anything that cannot fit — it never overlaps silently.
        </p>
        <div className="grid gap-3">
          <Input value={totalSeconds} onChange={(e) => setTotalSeconds(e.target.value)} placeholder="Video duration in seconds" />
          <textarea
            value={segments}
            onChange={(e) => setSegments(e.target.value)}
            rows={4}
            className="rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
          />
          <Button onClick={onPlanDub} disabled={planDub.isPending}>
            {planDub.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Plan the dub
          </Button>
        </div>

        {dub && (
          <div className="mt-4">
            <ol className="space-y-1.5">
              {dub.lines.map((line) => (
                <li key={line.index} className="rounded-md border border-border/50 px-3 py-2 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-primary">
                      {line.startSeconds}s → {line.endSeconds}s
                    </span>
                    <span className={`text-xs ${line.fits ? "text-muted-foreground" : "text-amber-400"}`}>
                      {line.fits ? `rate ${line.rate}×` : "does not fit"}
                    </span>
                  </div>
                  <p className="mt-0.5">{line.text}</p>
                  <p className="text-xs text-muted-foreground">~{line.estimatedSeconds}s of speech</p>
                </li>
              ))}
            </ol>
            <p className={`mt-3 text-xs ${dub.overflow.length ? "text-amber-400" : "text-muted-foreground"}`}>{dub.note}</p>
          </div>
        )}
      </section>

      {note && <p className="mt-4 rounded-md border border-border/60 bg-muted/30 p-3 text-sm">{note}</p>}
    </div>
  );
}
