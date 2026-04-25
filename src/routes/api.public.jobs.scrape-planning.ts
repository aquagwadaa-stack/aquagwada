import { createFileRoute } from "@tanstack/react-router";
import { scrapePlanning } from "@/server/jobs/scrape_planning";
import { rejectJobMethod, runProtectedJob } from "@/server/jobs/http";

export const Route = createFileRoute("/api/public/jobs/scrape-planning")({
  server: {
    handlers: {
      GET: async () => rejectJobMethod(),
      POST: async ({ request }) => runProtectedJob(request, () => scrapePlanning()),
    },
  },
});
