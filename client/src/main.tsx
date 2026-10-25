import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl, hasLoginPortal } from "./const";
import "./index.css";

/**
 * Retry policy.
 *
 * The default is to retry three times with exponential backoff, which is wrong in both
 * directions:
 *
 *  - It retries errors that can never succeed. A 401 without a session, a 403, or a 404
 *    will fail identically forever; retrying only makes the user stare at a spinner for
 *    about seven seconds before the same error appears. This was visible in the running
 *    app: the onboarding screen sat on "Loading the tool registry…" while the request was
 *    simply returning 401.
 *  - It gives up too early on the errors that are genuinely transient. Two retries with
 *    backoff is enough for a blip; beyond that the user should be told.
 *
 * So: retry only what can actually succeed on a second attempt.
 */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;

  const status = (error as { data?: { httpStatus?: number }; shape?: { data?: { httpStatus?: number } } })?.data?.httpStatus
    ?? (error as { shape?: { data?: { httpStatus?: number } } })?.shape?.data?.httpStatus;

  // No status at all means the request never reached the server: a network error, which
  // is exactly the case worth retrying.
  if (typeof status !== "number") return true;

  return RETRYABLE_STATUS.has(status);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      // A window focus should not re-fire every failed query at once.
      refetchOnWindowFocus: false,
      // A permanently failing query must stop asking, not poll forever.
      staleTime: 30_000,
    },
    mutations: {
      // A mutation that failed for a permanent reason must not be retried: replaying a
      // write can duplicate it.
      retry: false,
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;
  // With no hosted portal there is nowhere to send the user. Navigating anyway used
  // to bounce them to an unrelated page; staying put lets the UI offer sign-in.
  if (!hasLoginPortal()) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
