import { createFileRoute } from "@tanstack/react-router";
import { cleanupHistory } from "@/server/jobs/cleanup_history";
import { runProtectedJob } from "@/server/jobs/http";

export const Route = createFileRoute("/api/public/jobs/cleanup-history")({
  server: {
    handlers: {
      POST: async ({ request }) => runProtectedJob(request, () => cleanupHistory()),
    },
  },
});
