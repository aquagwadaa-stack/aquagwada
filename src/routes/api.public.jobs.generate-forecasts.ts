import { createFileRoute } from "@tanstack/react-router";
import { generateForecasts } from "@/server/jobs/generate_forecasts";
import { rejectJobMethod, runProtectedJob } from "@/server/jobs/http";

export const Route = createFileRoute("/api/public/jobs/generate-forecasts")({
  server: {
    handlers: {
      GET: async () => rejectJobMethod(),
      POST: async ({ request }) => runProtectedJob(request, () => generateForecasts()),
    },
  },
});
