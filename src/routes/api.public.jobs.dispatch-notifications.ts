import { createFileRoute } from "@tanstack/react-router";
import { dispatchNotifications } from "@/server/jobs/dispatch_notifications";
import { runProtectedJob } from "@/server/jobs/http";

export const Route = createFileRoute("/api/public/jobs/dispatch-notifications")({
  server: {
    handlers: {
      POST: async ({ request }) => runProtectedJob(request, () => dispatchNotifications()),
    },
  },
});
