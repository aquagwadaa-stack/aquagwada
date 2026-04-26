import { createFileRoute } from "@tanstack/react-router";
import { dispatchNotifications } from "@/server/jobs/dispatch_notifications";
import { rejectJobMethod, runProtectedJob } from "@/server/jobs/http";

export const Route = createFileRoute("/api/public/jobs/dispatch-notifications")({
  server: {
    handlers: {
      GET: async () => rejectJobMethod(),
      POST: async ({ request }) => runProtectedJob(request, () => dispatchNotifications()),
    },
  },
});
