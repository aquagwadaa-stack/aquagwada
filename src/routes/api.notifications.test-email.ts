import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail } from "@/server/email/resend";

const jsonHeaders = { "content-type": "application/json" };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function bearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  return authHeader?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}

export const Route = createFileRoute("/api/notifications/test-email")({
  server: {
    handlers: {
      GET: async () => jsonResponse({ ok: false, error: "method_not_allowed", message: "Use POST." }, 405),
      POST: async ({ request }) => {
        const token = bearerToken(request);
        if (!token) {
          return jsonResponse({ ok: false, error: "unauthorized", message: "Connexion requise." }, 401);
        }

        const { data, error } = await supabaseAdmin.auth.getUser(token);
        const user = data.user;
        if (error || !user?.id) {
          return jsonResponse({ ok: false, error: "unauthorized", message: "Session invalide." }, 401);
        }
        if (!user.email) {
          return jsonResponse({ ok: false, error: "missing_email", message: "Aucun email associe a ce compte." }, 400);
        }

        const result = await sendEmail({
          to: user.email,
          subject: "Test email AquaGwada",
          html: [
            "<p>Si vous recevez cet email, l'envoi Resend fonctionne pour AquaGwada.</p>",
            "<p>Les alertes email utiliseront le meme canal quand l'option Email est activee.</p>",
          ].join(""),
          text: "Si vous recevez cet email, l'envoi Resend fonctionne pour AquaGwada.",
        });

        if (!result.ok) {
          return jsonResponse({
            ok: false,
            error: "email_send_failed",
            message: result.error ?? "Email test non envoye.",
          }, result.skipped ? 503 : 500);
        }

        return jsonResponse({
          ok: true,
          id: result.id,
          message: "Email test envoye.",
        });
      },
    },
  },
});
