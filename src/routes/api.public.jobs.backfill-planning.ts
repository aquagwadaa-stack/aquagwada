import { createFileRoute } from "@tanstack/react-router";
import { backfillPlanningHistory } from "@/server/jobs/scrape_planning";
import { rejectJobMethod, runProtectedJob } from "@/server/jobs/http";

type BackfillBody = {
  since?: string;
  maxPosts?: number;
};

export const Route = createFileRoute("/api/public/jobs/backfill-planning")({
  server: {
    handlers: {
      GET: async () => rejectJobMethod(),
      POST: async ({ request }) =>
        runProtectedJob(request, async () => {
          const body = (await request.json().catch(() => ({}))) as BackfillBody;
          return backfillPlanningHistory({ since: body.since, maxPosts: body.maxPosts });
        }),
    },
  },
});
