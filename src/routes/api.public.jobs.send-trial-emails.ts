import { createFileRoute } from "@tanstack/react-router";
import { sendTrialEmails } from "@/server/jobs/send_trial_emails";
import { rejectJobMethod, runProtectedJob } from "@/server/jobs/http";

export const Route = createFileRoute("/api/public/jobs/send-trial-emails")({
  server: {
    handlers: {
      GET: async () => rejectJobMethod(),
      POST: async ({ request }) => runProtectedJob(request, () => sendTrialEmails()),
    },
  },
});
