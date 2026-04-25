import { createFileRoute } from "@tanstack/react-router";
import { processReports } from "@/server/jobs/process_reports";
import { runProtectedJob } from "@/server/jobs/http";

export const Route = createFileRoute("/api/public/jobs/process-reports")({
  server: {
    handlers: {
      POST: async ({ request }) => runProtectedJob(request, () => processReports()),
    },
  },
});
