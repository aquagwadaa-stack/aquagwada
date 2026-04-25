import { createFileRoute } from "@tanstack/react-router";
import { scrapeAIHistory } from "@/server/jobs/scrape_ai_history";
import { rejectJobMethod, runProtectedJob } from "@/server/jobs/http";

export const Route = createFileRoute("/api/public/jobs/scrape-ai-history")({
  server: {
    handlers: {
      GET: async () => rejectJobMethod(),
      POST: async ({ request }) => runProtectedJob(request, () => scrapeAIHistory()),
    },
  },
});
