import { createFileRoute } from "@tanstack/react-router";
import { cleanupHistory } from "@/server/jobs/cleanup_history";
import { rejectJobMethod, runProtectedJob } from "@/server/jobs/http";

export const Route = createFileRoute("/api/public/jobs/cleanup-history")({
  server: {
    handlers: {
      GET: async () => rejectJobMethod(),
      POST: async ({ request }) => runProtectedJob(request, () => cleanupHistory()),
    },
  },
});
