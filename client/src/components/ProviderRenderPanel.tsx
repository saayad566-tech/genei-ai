import { useState } from "react";
import { Cloud, Loader2, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/**
 * Hosted provider rendering.
 *
 * Some productions are better served by a hosted model than by a local one. This panel
 * submits a prompt to the provider the user chooses and polls the task until it settles.
 *
 * It is explicit about what it needs: the submission will fail with the provider's own
 * message when no key is configured for that provider, and that message is shown rather
 * than swallowed. Nothing here claims a render that did not happen.
 */

const PROVIDERS = [
  { id: "runway", label: "Runway" },
  { id: "pika", label: "Pika" },
  { id: "kling", label: "Kling" },
  { id: "heygen", label: "HeyGen" },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["id"];

type Task = { provider: ProviderId; taskId: string; submittedAt: number };

export default function ProviderRenderPanel({ defaultPrompt = "" }: { defaultPrompt?: string }) {
  const [provider, setProvider] = useState<ProviderId>("runway");
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [duration, setDuration] = useState(5);
  const [task, setTask] = useState<Task | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const submit = trpc.director.submitProviderVideo.useMutation({
    onSuccess: (result) => {
      setTask({ provider, taskId: result.taskId, submittedAt: Date.now() });
      // The provider's own verdict, including an honest "this adapter is not configured".
      setStatus(result.error ? `The provider adapter reported: ${result.error}` : `Task ${result.taskId} is ${result.status}.`);
      if (result.error) toast.error(result.error);
      else toast.message("Sent to the provider", { description: `${provider} accepted the task.` });
    },
    onError: (error) => {
      // The provider's own message — usually "no key configured" — is the useful part.
      setStatus(`Could not submit: ${error.message}`);
      toast.error(error.message);
    },
  });

  const poll = trpc.director.pollProviderVideo.useMutation({
    onSuccess: (result) => {
      setStatus(result.status ? `Provider status: ${result.status}` : "The provider returned no status.");
      toast.message("Checked the provider", { description: result.status ?? "no status returned" });
    },
    onError: (error) => setStatus(`Could not poll: ${error.message}`),
  });

  return (
    <div className="genei-card rounded-2xl p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Cloud className="h-4 w-4 text-primary" /> Render with a hosted provider
        <span className="text-[10px] font-normal text-muted-foreground">needs a key for the provider you pick</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Sends this prompt to a hosted video model instead of rendering locally. The provider must have a key configured in API Integrations;
        without one the request fails and says so.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <select className="genei-input text-sm" value={provider} onChange={(event) => setProvider(event.target.value as ProviderId)}>
          {PROVIDERS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
        <select className="genei-input text-sm" value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
          {[3, 5, 8, 10].map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds}s
            </option>
          ))}
        </select>
        <button
          type="button"
          className="gx-cta"
          disabled={submit.isPending || !prompt.trim()}
          onClick={() => submit.mutate({ provider, prompt: prompt.trim(), duration })}
        >
          {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit
        </button>
        {task ? (
          <button
            type="button"
            className="gx-seg-btn gx-seg"
            disabled={poll.isPending}
            onClick={() => poll.mutate({ provider: task.provider, taskId: task.taskId })}
          >
            {poll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check status
          </button>
        ) : null}
      </div>

      <textarea
        className="genei-input mt-2 w-full resize-none text-sm"
        rows={3}
        placeholder="What should the provider render?"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
      />

      {task ? (
        <p className="mt-2 font-mono text-[10px] text-muted-foreground">
          task {task.taskId} · submitted {new Date(task.submittedAt).toLocaleTimeString()}
        </p>
      ) : null}
      {status ? <p className="mt-1 text-xs text-muted-foreground">{status}</p> : null}
    </div>
  );
}
