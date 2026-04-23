import { createFileRoute } from "@tanstack/react-router";
import { checkPreventiveNotifications } from "@/server/jobs/check_preventive";

/** Cron : vérifie les notifications préventives à envoyer. 1×/heure. */
export const Route = createFileRoute("/api/public/jobs/check-preventive")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-job-token");
        const expected = process.env.JOB_TOKEN;
        if (!expected || token !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
        }
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