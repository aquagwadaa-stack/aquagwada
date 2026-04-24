import { createFileRoute } from "@tanstack/react-router";
import { checkPreventiveNotifications } from "@/server/jobs/check_preventive";

/** Cron : vérifie les notifications préventives à envoyer. 1×/heure. */
export const Route = createFileRoute("/api/public/jobs/check-preventive")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const result = await checkPreventiveNotifications();
          return new Response(JSON.stringify({ ok: true, ...result }), { status: 200 });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500 });
        }
      },
    },
  },
});