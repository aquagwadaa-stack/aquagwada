import { createFileRoute } from "@tanstack/react-router";
import { checkPreventiveNotifications } from "@/server/jobs/check_preventive";
import { runProtectedJob } from "@/server/jobs/http";

export const Route = createFileRoute("/api/public/jobs/check-preventive")({
  server: {
    handlers: {
      POST: async ({ request }) => runProtectedJob(request, () => checkPreventiveNotifications()),
    },
  },
});
