import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, AlertTriangle, Info, XCircle } from "lucide-react";

/**
 * Continuity check.
 *
 * Paste a project as JSON and get every recorded contradiction back: a character not in the
 * cast, a prop before its introduction, a wardrobe change with no reason, a location jump
 * with no transition, a time regression, a screen-direction flip, a fact learned twice.
 *
 * The panel is explicit that a clean result is not a verdict — the engine's own `coverage`
 * field says so, and it is shown rather than hidden.
 */
export default function Continuity() {
  const check = trpc.continuity.check.useMutation();
  const gate = trpc.continuity.gate.useMutation();
  const stale = trpc.continuity.stale.useMutation();
  const [source, setSource] = useState(EXAMPLE);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    try {
      const parsed = JSON.parse(source);
      await check.mutateAsync(parsed);
      // A gate decision and the stale set are derived from the same project, so they are
      // computed together rather than making the user press three buttons.
      await gate.mutateAsync({ ...parsed, override: false });
      const firstCharacter = parsed.characters?.[0]?.id;
      if (firstCharacter) await stale.mutateAsync({ ...parsed, change: { kind: "character", id: firstCharacter } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The project could not be read.");
    }
  }

  const report = check.data;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Continuity check</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Finds contradictions across a scene list before anything is rendered. Each finding names the
          reference it failed against and a proposed action — it does not approve or reject the work.
        </p>
      </header>

      <section className="gx-panel mb-6 p-5">
        <label htmlFor="project" className="mb-1.5 block text-sm font-medium">
          Project JSON
        </label>
        <textarea
          id="project"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          rows={12}
          spellCheck={false}
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
        />
        <Button onClick={run} disabled={check.isPending} className="mt-3">
          {check.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
          Check continuity
        </Button>
        {error && <p className="mt-3 rounded-md border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-300">{error}</p>}
      </section>

      {report && (
        <section className="space-y-4">
          <div className={`gx-panel flex items-start gap-3 border-l-2 p-4 ${report.counts.error ? "border-red-500/60" : report.counts.warning ? "border-amber-500/60" : "border-emerald-500/60"}`}>
            {report.counts.error ? (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            ) : report.counts.warning ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            ) : (
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            )}
            <div className="text-sm">
              <p className="font-medium">{report.summary}</p>
              <p className="mt-1 text-xs text-muted-foreground">{report.coverage}</p>
            </div>
          </div>

          {gate.data && (
            <div className={`gx-panel flex items-start gap-3 border-l-2 p-4 ${gate.data.allowed ? "border-emerald-500/60" : "border-red-500/60"}`}>
              <ShieldCheck className={`mt-0.5 h-4 w-4 shrink-0 ${gate.data.allowed ? "text-emerald-400" : "text-red-400"}`} />
              <div className="text-sm">
                <p className="font-medium">
                  Render gate: {gate.data.allowed ? "may proceed" : "blocked"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{gate.data.reason}</p>
                {gate.data.blocking.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {gate.data.blocking.length} blocking · {gate.data.advisory.length} advisory
                  </p>
                )}
              </div>
            </div>
          )}

          {stale.data && (
            <div className="gx-panel p-4">
              <h2 className="mb-1 text-sm font-medium">Change propagation</h2>
              <p className="text-xs text-muted-foreground">
                Changing <span className="font-mono">{stale.data.staleSceneIds.length}</span> scene(s) would need
                re-rendering; <span className="font-mono">{stale.data.unaffectedSceneIds.length}</span> would not.
              </p>
              <ul className="mt-2 space-y-1 text-xs">
                {stale.data.reasons.map((entry) => (
                  <li key={entry.sceneId} className="text-muted-foreground">
                    <span className="font-mono text-primary">{entry.sceneId}</span> — {entry.reason}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Unaffected: <span className="font-mono">{stale.data.unaffectedSceneIds.join(", ") || "none"}</span>
              </p>
            </div>
          )}

          {report.issues.length > 0 && (
            <ol className="space-y-2">
              {report.issues.map((issue, i) => (
                <li key={`${issue.code}-${issue.sceneId}-${i}`} className="gx-panel p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-mono text-xs text-primary">{issue.code}</span>
                    <span
                      className={`text-xs ${
                        issue.severity === "error"
                          ? "text-red-400"
                          : issue.severity === "warning"
                            ? "text-amber-400"
                            : "text-muted-foreground"
                      }`}
                    >
                      {issue.severity} · scene {issue.sceneId}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm">{issue.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Failed against: <span className="font-mono">{issue.reference}</span>
                  </p>
                  <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Info className="mt-0.5 h-3 w-3 shrink-0" />
                    {issue.action}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}

const EXAMPLE = JSON.stringify(
  {
    characters: [{ id: "aria", name: "Aria", wardrobe: ["coat", "boots"] }],
    locations: [
      { id: "outpost", name: "Outpost" },
      { id: "underbelly", name: "Underbelly" },
    ],
    props: [{ id: "envelope", name: "Envelope", introducedInSceneId: "s2" }],
    scenes: [
      {
        id: "s1",
        index: 1,
        time: { label: "day 1", order: 1 },
        locationId: "outpost",
        characters: [{ characterId: "aria", wardrobe: ["coat", "boots"] }],
        props: ["envelope"],
      },
      {
        id: "s2",
        index: 2,
        time: { label: "day 1 later", order: 2 },
        locationId: "underbelly",
        characters: [{ characterId: "aria", wardrobe: ["dress"] }],
        props: ["envelope"],
      },
    ],
  },
  null,
  2,
);
