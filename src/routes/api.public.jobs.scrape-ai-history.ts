import { createFileRoute } from "@tanstack/react-router";
import { scrapeAIHistory } from "@/server/jobs/scrape_ai_history";

/** Cron : reconstitue l'historique via Firecrawl + IA. Hebdo. */
export const Route = createFileRoute("/api/public/jobs/scrape-ai-history")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await scrapeAIHistory();
          return new Response(JSON.stringify(result), { status: 200 });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500 });
        }
      },
    },
  },
});