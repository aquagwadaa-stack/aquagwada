import { createFileRoute } from "@tanstack/react-router";
import { backfillPlanningHistory } from "@/server/jobs/scrape_planning";

/** Admin/cron manuel : backfill des vrais plannings SMGEAG historiques. */
export const Route = createFileRoute("/api/public/jobs/backfill-planning")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({})) as { since?: string; maxPosts?: number };
          const result = await backfillPlanningHistory({ since: body.since, maxPosts: body.maxPosts });
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
