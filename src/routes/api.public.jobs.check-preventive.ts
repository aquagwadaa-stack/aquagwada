import { createFileRoute } from "@tanstack/react-router";
import { checkPreventiveNotifications } from "@/server/jobs/check_preventive";
import { rejectJobMethod, runProtectedJob } from "@/server/jobs/http";

export const Route = createFileRoute("/api/public/jobs/check-preventive")({
  server: {
    handlers: {
      GET: async () => rejectJobMethod(),
      POST: async ({ request }) => runProtectedJob(request, () => checkPreventiveNotifications()),
    },
  },
});
