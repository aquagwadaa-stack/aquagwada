import { createFileRoute } from "@tanstack/react-router";
import { processReports } from "@/server/jobs/process_reports";
import { rejectJobMethod, runProtectedJob } from "@/server/jobs/http";

export const Route = createFileRoute("/api/public/jobs/process-reports")({
  server: {
    handlers: {
      GET: async () => rejectJobMethod(),
      POST: async ({ request }) => runProtectedJob(request, () => processReports()),
    },
  },
});
