import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail, trialEndedEmail, trialEndingEmail } from "@/server/email/resend";

type TrialSubscription = {
  user_id: string;
  trial_ends_at: string | null;
};

async function getUserEmail(userId: string) {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

async function alreadySent(userId: string, kind: "trial_ending" | "trial_ended") {
  const { data, error } = await (supabaseAdmin as any)
    .from("trial_email_reminders")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", kind)
    .maybeSingle();

  if (error && !String(error.message).includes("does not exist")) {
    console.warn("[send_trial_emails] reminder lookup failed", error.message);
  }
  return !!data;
}

async function markSent(userId: string, kind: "trial_ending" | "trial_ended") {
  const { error } = await (supabaseAdmin as any)
    .from("trial_email_reminders")
    .insert({ user_id: userId, kind });
  if (error && !String(error.message).toLowerCase().includes("duplicate")) {
    console.warn("[send_trial_emails] reminder insert failed", error.message);
  }
}

export async function sendTrialEmails(): Promise<{ ok: boolean; checked: number; sent: number; skipped: number }> {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 3600_000).toISOString();
  const nowIso = now.toISOString();

  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id, trial_ends_at")
    .eq("status", "trialing")
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
    const kind = ended ? "trial_ended" : "trial_ending";
    if (await alreadySent(row.user_id, kind)) {
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
      await markSent(row.user_id, kind);
      sent += 1;
    } else {
      skipped += 1;
      console.warn("[send_trial_emails] email not sent", result.error);
    }
  }

  return { ok: true, checked, sent, skipped };
}
