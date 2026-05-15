import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushToUser } from "@/server/notifications/send_push";

const jsonHeaders = { "content-type": "application/json" };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function bearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  return authHeader?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}

export const Route = createFileRoute("/api/notifications/test-push")({
  server: {
    handlers: {
      GET: async () => jsonResponse({ ok: false, error: "method_not_allowed", message: "Use POST." }, 405),
      POST: async ({ request }) => {
        const token = bearerToken(request);
        if (!token) {
          return jsonResponse({ ok: false, error: "unauthorized", message: "Connexion requise." }, 401);
        }

        const { data, error } = await supabaseAdmin.auth.getUser(token);
        const userId = data.user?.id;
        if (error || !userId) {
          return jsonResponse({ ok: false, error: "unauthorized", message: "Session invalide." }, 401);
        }

        try {
          const result = await sendPushToUser(userId, {
            title: "Test AquaGwada",
            body: "Si vous voyez cette notification, les push serveur fonctionnent sur cet appareil.",
            url: "/ma-commune",
            tag: `test-push-${userId}-${Date.now()}`,
            requireInteraction: true,
          });

          const ok = result.sent > 0;
          return jsonResponse({
            ok,
            ...result,
            message: ok
              ? "Notification test envoyee."
              : result.lastError ?? "Aucun appareil n'a recu la notification test.",
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return jsonResponse({ ok: false, error: "push_send_failed", message }, 500);
        }
      },
    },
  },
});
