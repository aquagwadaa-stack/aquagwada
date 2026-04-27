import { createFileRoute } from "@tanstack/react-router";
import { scrapeSocialSignals } from "@/server/jobs/scrape_social_signals";
import { rejectJobMethod, runProtectedJob } from "@/server/jobs/http";

export const Route = createFileRoute("/api/public/jobs/scrape-social-signals")({
  server: {
    handlers: {
      GET: async () => rejectJobMethod(),
      POST: async ({ request }) => runProtectedJob(request, () => scrapeSocialSignals()),
    },
  },
});
