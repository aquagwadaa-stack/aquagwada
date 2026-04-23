import { createFileRoute } from "@tanstack/react-router";
import { processReports } from "@/server/jobs/process_reports";

/** Cron : traitement des signalements utilisateurs. Toutes les 5 min. */
export const Route = createFileRoute("/api/public/jobs/process-reports")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-job-token");
        const expected = process.env.JOB_TOKEN;
        if (!expected || token !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
        }
        try {
          const result = await processReports();
          return new Response(JSON.stringify(result), { status: 200 });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500 });
        }
      },
    },
  },
});