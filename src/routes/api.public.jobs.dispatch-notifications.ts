import { createFileRoute } from "@tanstack/react-router";
import { dispatchNotifications } from "@/server/jobs/dispatch_notifications";

/** Cron : dispatch notifications (dry-run tant que pas de domaine email). Toutes les 5 min. */
export const Route = createFileRoute("/api/public/jobs/dispatch-notifications")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const result = await dispatchNotifications();
          return new Response(JSON.stringify(result), { status: 200 });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500 });
        }
      },
    },
  },
});