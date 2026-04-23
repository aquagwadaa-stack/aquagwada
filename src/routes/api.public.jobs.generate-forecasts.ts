import { createFileRoute } from "@tanstack/react-router";
import { generateForecasts } from "@/server/jobs/generate_forecasts";

/** Cron : régénère les prévisions pour les 14 prochains jours. 1×/jour. */
export const Route = createFileRoute("/api/public/jobs/generate-forecasts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-job-token");
        const expected = process.env.JOB_TOKEN;
        if (!expected || token !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
        }
        try {
          const result = await generateForecasts();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200, headers: { "content-type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500 });
        }
      },
    },
  },
});