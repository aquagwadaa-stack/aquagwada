import { createFileRoute } from "@tanstack/react-router";
import { cleanupHistory } from "@/server/jobs/cleanup_history";

/** Cron : déplace les coupures terminées > 7j vers outage_history. 1×/semaine. */
export const Route = createFileRoute("/api/public/jobs/cleanup-history")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const result = await cleanupHistory();
          return new Response(JSON.stringify({ ok: true, ...result }), { status: 200 });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500 });
        }
      },
    },
  },
});