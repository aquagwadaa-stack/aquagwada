import { createFileRoute } from "@tanstack/react-router";
import { scrapeSmgeag } from "@/server/jobs/scraper_smgeag";
import { rejectJobMethod, runProtectedJob } from "@/server/jobs/http";

export const Route = createFileRoute("/api/public/jobs/scrape-smgeag")({
  server: {
    handlers: {
      GET: async () => rejectJobMethod(),
      POST: async ({ request }) => runProtectedJob(request, () => scrapeSmgeag()),
    },
  },
});
