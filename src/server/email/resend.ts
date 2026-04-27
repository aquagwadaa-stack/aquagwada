type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type EmailResult = {
  ok: boolean;
  skipped?: boolean;
  id?: string;
  error?: string;
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "AquaGwada <notifications@aquagwada.fr>";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function layout(title: string, body: string, action?: { label: string; url: string }) {
  const safeTitle = escapeHtml(title);
  const safeBody = body
    .split("\n")
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
  const actionHtml = action
    ? `<p><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#0f6b9a;color:#fff;text-decoration:none;padding:12px 16px;border-radius:8px;font-weight:700">${escapeHtml(action.label)}</a></p>`
    : "";

  return `<!doctype html><html><body style="margin:0;background:#f6fbfd;font-family:Arial,sans-serif;color:#102033"><div style="max-width:560px;margin:0 auto;padding:24px"><div style="background:#fff;border:1px solid #d9ecf2;border-radius:12px;padding:24px"><p style="margin:0 0 12px;color:#168aad;font-weight:700">AquaGwada</p><h1 style="font-size:22px;line-height:1.25;margin:0 0 16px">${safeTitle}</h1><div style="font-size:15px;line-height:1.55;color:#304050">${safeBody}</div>${actionHtml}<p style="font-size:12px;color:#667;margin-top:24px">Vous recevez cet email car vous utilisez AquaGwada.</p></div></div></body></html>`;
}

function appUrl(path = "/ma-commune") {
  const origin = process.env.PUBLIC_SITE_URL || process.env.VITE_PUBLIC_SITE_URL || "https://aquagwada.fr";
  return `${origin.replace(/\/$/, "")}${path}`;
}

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, skipped: true, error: "RESEND_API_KEY missing" };
  }

  const from = process.env.EMAIL_FROM || DEFAULT_FROM;
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.message === "string" ? data.message : `Resend HTTP ${response.status}`;
    return { ok: false, error: message };
  }

  return { ok: true, id: typeof data?.id === "string" ? data.id : undefined };
}

export function outageEmail(title: string, body: string) {
  return {
    subject: title.replace(/[\u{1F300}-\u{1FAFF}]/gu, "").trim(),
    html: layout(title, body, { label: "Voir ma commune", url: appUrl("/ma-commune") }),
    text: `${title}\n\n${body}\n\n${appUrl("/ma-commune")}`,
  };
}

export function trialEndingEmail(daysLeft: number) {
  const title = "Votre essai Pro se termine bientot";
  const body = `Il reste environ ${daysLeft} jour${daysLeft > 1 ? "s" : ""} sur votre essai AquaGwada Pro.\nPour garder les previsions, l'historique 1 an et jusqu'a 5 communes, vous pouvez vous abonner depuis la page Abonnements.`;
  return {
    subject: title,
    html: layout(title, body, { label: "Gerer mon abonnement", url: appUrl("/abonnements") }),
    text: `${title}\n\n${body}\n\n${appUrl("/abonnements")}`,
  };
}

export function trialEndedEmail() {
  const title = "Votre essai Pro est termine";
  const body = "Votre compte est repasse en formule gratuite. Vous gardez l'acces au suivi de base, et vous pouvez reprendre Pro a tout moment.";
  return {
    subject: title,
    html: layout(title, body, { label: "Reprendre Pro", url: appUrl("/abonnements") }),
    text: `${title}\n\n${body}\n\n${appUrl("/abonnements")}`,
  };
}

export function paymentSucceededEmail(amount?: string) {
  const title = "Paiement AquaGwada confirme";
  const body = amount
    ? `Votre paiement de ${amount} a bien ete confirme. Votre abonnement Pro reste actif.`
    : "Votre paiement a bien ete confirme. Votre abonnement Pro reste actif.";
  return {
    subject: title,
    html: layout(title, body, { label: "Voir mon espace", url: appUrl("/ma-commune") }),
    text: `${title}\n\n${body}\n\n${appUrl("/ma-commune")}`,
  };
}

export function paymentFailedEmail() {
  const title = "Paiement AquaGwada a verifier";
  const body = "Stripe n'a pas pu confirmer votre dernier paiement. Verifiez votre moyen de paiement pour eviter l'interruption de Pro.";
  return {
    subject: title,
    html: layout(title, body, { label: "Gerer mon paiement", url: appUrl("/abonnements") }),
    text: `${title}\n\n${body}\n\n${appUrl("/abonnements")}`,
  };
}

export function subscriptionCanceledEmail() {
  const title = "Abonnement AquaGwada annule";
  const body = "Votre abonnement Pro a ete annule. Vous gardez les droits Pro jusqu'a la fin de la periode deja payee si Stripe l'indique, puis le compte repassera en gratuit.";
  return {
    subject: title,
    html: layout(title, body, { label: "Voir les abonnements", url: appUrl("/abonnements") }),
    text: `${title}\n\n${body}\n\n${appUrl("/abonnements")}`,
  };
}
