import { supabaseAdmin } from "@/integrations/supabase/client.server";

type JobActor =
  | { kind: "cron" }
  | { kind: "admin"; userId: string };

const jsonHeaders = { "content-type": "application/json" };

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...jsonHeaders, ...extraHeaders },
  });
}

function normalizeJobResult(result: unknown) {
  if (result && typeof result === "object" && !Array.isArray(result)) {
    return "ok" in result ? result : { ok: true, ...result };
  }
  return { ok: true, result };
}

export function rejectJobMethod() {
  return jsonResponse(
    { ok: false, error: "method_not_allowed", message: "Use POST for protected jobs." },
    405,
    { allow: "POST" },
  );
}

async function authorizeJobRequest(request: Request): Promise<JobActor | Response> {
  if (request.method !== "POST") return rejectJobMethod();

  const cronSecret = process.env.CRON_SECRET;
  const providedCronSecret = request.headers.get("x-cron-secret");
  if (cronSecret && providedCronSecret && providedCronSecret === cronSecret) {
    return { kind: "cron" };
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return jsonResponse(
      { ok: false, error: "unauthorized", message: "Missing admin bearer token or cron secret." },
      401,
    );
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  const userId = userData.user?.id;
  if (userError || !userId) {
    return jsonResponse({ ok: false, error: "unauthorized", message: "Invalid bearer token." }, 401);
  }

  const { data: role, error: roleError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (roleError) {
    return jsonResponse({ ok: false, error: "admin_check_failed", message: roleError.message }, 500);
  }
  if (!role) {
    return jsonResponse({ ok: false, error: "forbidden", message: "Admin role required." }, 403);
  }

  return { kind: "admin", userId };
}

export async function runProtectedJob(request: Request, job: (actor: JobActor) => Promise<unknown>) {
  const actor = await authorizeJobRequest(request);
  if (actor instanceof Response) return actor;

  try {
    const result = await job(actor);
    return jsonResponse(normalizeJobResult(result), 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
}
