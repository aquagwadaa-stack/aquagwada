import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail, trialEndedEmail, trialEndingEmail } from "@/server/email/resend";

type TrialSubscription = {
  id: string;
  user_id: string;
  status: string;
  trial_ends_at: string | null;
};

async function getUserEmail(userId: string) {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

async function alreadySent(subscriptionId: string, kind: "trial_ending" | "trial_ended") {
  const { data, error } = await (supabaseAdmin as any)
    .from("trial_email_reminders")
    .select("id")
    .eq("subscription_id", subscriptionId)
    .eq("kind", kind)
    .maybeSingle();

  if (error && !String(error.message).includes("does not exist")) {
    console.warn("[send_trial_emails] reminder lookup failed", error.message);
  }
  return !!data;
}

async function markSent(row: TrialSubscription, kind: "trial_ending" | "trial_ended") {
  if (!row.trial_ends_at) return false;
  const { error } = await (supabaseAdmin as any)
    .from("trial_email_reminders")
    .insert({
      subscription_id: row.id,
      user_id: row.user_id,
      trial_ends_at: row.trial_ends_at,
      kind,
    });
  if (error && !String(error.message).toLowerCase().includes("duplicate")) {
    console.warn("[send_trial_emails] reminder insert failed", error.message);
    return false;
  }
  return true;
}

export async function sendTrialEmails(): Promise<{ ok: boolean; checked: number; sent: number; skipped: number }> {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 3600_000).toISOString();
  const nowIso = now.toISOString();

  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("id, user_id, status, trial_ends_at")
    .in("status", ["trialing", "expired"])
    .not("trial_ends_at", "is", null)
    .lte("trial_ends_at", in24h);

  if (error) throw error;

  let checked = 0;
  let sent = 0;
  let skipped = 0;

  for (const row of (data ?? []) as TrialSubscription[]) {
    checked += 1;
    if (!row.trial_ends_at) {
      skipped += 1;
      continue;
    }

    const ended = row.trial_ends_at <= nowIso;
    if (!ended && row.status !== "trialing") {
      skipped += 1;
      continue;
    }
    const kind = ended ? "trial_ended" : "trial_ending";
    if (await alreadySent(row.id, kind)) {
      skipped += 1;
      continue;
    }

    const email = await getUserEmail(row.user_id);
    if (!email) {
      skipped += 1;
      continue;
    }

    const daysLeft = Math.max(0, Math.ceil((new Date(row.trial_ends_at).getTime() - now.getTime()) / 86400_000));
    const template = ended ? trialEndedEmail() : trialEndingEmail(daysLeft || 1);
    const result = await sendEmail({ to: email, ...template });
    if (result.ok) {
      const marked = await markSent(row, kind);
      if (marked) sent += 1;
      else skipped += 1;
    } else {
      skipped += 1;
      console.warn("[send_trial_emails] email not sent", result.error);
    }
  }

  return { ok: true, checked, sent, skipped };
}
