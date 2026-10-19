// Exercises the Hub through the same proxy dispatcher the server installs at startup.
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
setGlobalDispatcher(new EnvHttpProxyAgent());
try {
  const r = await fetch("https://huggingface.co/api/models?limit=1");
  process.exit(r.ok ? 0 : 1);
} catch {
  process.exit(1);
}
