import React, { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Webhook } from "lucide-react";

export function WebhookToastWatcher() {
  const seenIds = useRef<Set<number>>(new Set());
  const { data: receipts } = trpc.globalSettings.getRecentWebhookReceipts.useQuery(undefined, {
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!receipts) return;
    for (const r of receipts) {
      if (!seenIds.current.has(r.id)) {
        seenIds.current.add(r.id);
        if (seenIds.current.size > 50) {
          const first = seenIds.current.values().next().value;
          if (first !== undefined) seenIds.current.delete(first);
        }
        // Only toast if created within the last 60 seconds
        const ageSec = (Date.now() - new Date(r.createdAt).getTime()) / 1000;
        if (ageSec < 60) {
          toast.success(`Verified Webhook Received (${r.provider})`, {
            description: `Task ${r.externalTaskId} event ${r.eventType} processed successfully.`,
            icon: <Webhook className="w-4 h-4 text-primary" />,
          });
        }
      }
    }
  }, [receipts]);

  return null;
}
