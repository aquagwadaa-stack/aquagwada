import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyStripeWebhook, createStripeClient, type StripeEnv } from "@/server/stripe/client";
import { paymentFailedEmail, paymentSucceededEmail, sendEmail, subscriptionCanceledEmail } from "@/server/email/resend";
import type Stripe from "stripe";

/**
 * Webhook Stripe via Lovable gateway.
 * URL: /api/public/payments/webhook?env=sandbox|live
 */
export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const rawEnv = url.searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          return new Response(JSON.stringify({ ignored: "invalid env" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        const env: StripeEnv = rawEnv;

        try {
          const event = await verifyStripeWebhook(request, env) as {
            id?: string;
            type: string;
            data: { object: Record<string, unknown> };
          };
          const shouldProcess = await markStripeEventProcessed(event.id, event.type);
          if (!shouldProcess) {
            return new Response(JSON.stringify({ received: true, duplicate: true }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          switch (event.type) {
            case "checkout.session.completed":
              await syncCheckoutSession(event.data.object as unknown as Stripe.Checkout.Session, env);
              break;
            case "customer.subscription.created":
            case "customer.subscription.updated":
              await upsertSubscription(event.data.object as unknown as Stripe.Subscription, env);
              break;
            case "customer.subscription.deleted":
              await cancelSubscription(event.data.object as unknown as Stripe.Subscription, env);
              break;
            case "invoice.payment_succeeded":
              await sendInvoiceEmail(event.data.object as unknown as Stripe.Invoice, "paid");
              break;
            case "invoice.payment_failed":
              await sendInvoiceEmail(event.data.object as unknown as Stripe.Invoice, "failed");
              break;
            default:
              break;
          }

          return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          console.error("[stripe-webhook] error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});

async function markStripeEventProcessed(eventId: string | undefined, eventType: string) {
  if (!eventId) return true;
  const { error } = await (supabaseAdmin as any)
    .from("stripe_event_logs")
    .insert({ id: eventId, event_type: eventType });
  if (!error) return true;
  if (String(error.message).toLowerCase().includes("duplicate")) return false;
  console.warn("[stripe-webhook] event log insert failed:", error.message);
  return true;
}

function tierFromPrice(priceId: string | null | undefined): "pro" | "business" | "free" {
  if (!priceId) return "free";
  if (priceId === "pro_monthly" || priceId.startsWith("aquagwada_pro") || priceId.includes("pro_")) return "pro";
  if (priceId.includes("business")) return "business";
  return "pro";
}

function statusFromStripe(status: string): "active" | "trialing" | "past_due" | "canceled" | "expired" {
  if (status === "active" || status === "trialing" || status === "past_due" || status === "canceled") return status;
  if (status === "unpaid" || status === "incomplete_expired") return "expired";
  return "active";
}

async function resolveLookupKey(env: StripeEnv, internalPriceId: string): Promise<string> {
  try {
    const stripe = createStripeClient(env);
    const p = await stripe.prices.retrieve(internalPriceId);
    return p.lookup_key ?? internalPriceId;
  } catch {
    return internalPriceId;
  }
}

async function findUserIdByStripe(customerId?: string | null, subscriptionId?: string | null) {
  if (subscriptionId) {
    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_subscription_id", subscriptionId)
      .maybeSingle();
    if (data?.user_id) return data.user_id as string;
  }
  if (customerId) {
    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (data?.user_id) return data.user_id as string;
  }
  return null;
}

async function getUserEmail(userId: string) {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

async function syncCheckoutSession(session: Stripe.Checkout.Session, env: StripeEnv) {
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!subscriptionId) return;

  const stripe = createStripeClient(env);
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = session.metadata?.userId || (sub.metadata as Record<string, string> | null)?.userId;
  if (userId) await upsertSubscription(sub, env, userId);
}

async function upsertSubscription(sub: Stripe.Subscription, env: StripeEnv, forcedUserId?: string) {
  const userId = forcedUserId || (sub.metadata as Record<string, string> | null)?.userId || await findUserIdByStripe(
    typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    sub.id,
  );
  if (!userId) {
    console.error("[stripe-webhook] no userId for subscription", sub.id);
    return;
  }

  const item = sub.items?.data?.[0];
  const internalPriceId = item?.price?.id ?? "";
  const productId = typeof item?.price?.product === "string" ? item.price.product : null;
  const lovableId = (item?.price?.metadata as Record<string, string> | undefined)?.lovable_external_id;
  const humanPriceId = lovableId ?? item?.price?.lookup_key ?? (await resolveLookupKey(env, internalPriceId));

  type StripeSubscriptionItemWithPeriod = Stripe.SubscriptionItem & {
    current_period_start?: number | null;
    current_period_end?: number | null;
  };
  type StripeSubscriptionWithPeriod = Stripe.Subscription & {
    current_period_start?: number | null;
    current_period_end?: number | null;
  };
  const itemWithPeriod = item as StripeSubscriptionItemWithPeriod | undefined;
  const subWithPeriod = sub as StripeSubscriptionWithPeriod;
  const periodStart = itemWithPeriod?.current_period_start ?? subWithPeriod.current_period_start ?? null;
  const periodEnd = itemWithPeriod?.current_period_end ?? subWithPeriod.current_period_end ?? null;

  const status = statusFromStripe(sub.status);
  const row = {
    user_id: userId,
    stripe_subscription_id: sub.id,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    product_id: productId,
    price_id: humanPriceId,
    status,
    tier: status === "canceled" || status === "expired" ? "free" : tierFromPrice(humanPriceId),
    trial_ends_at: null,
    current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    environment: env,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(row as never, { onConflict: "user_id" });
  if (error) console.error("[stripe-webhook] upsert error:", error);
}

async function cancelSubscription(sub: Stripe.Subscription, env: StripeEnv) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const userId = (sub.metadata as Record<string, string> | null)?.userId || await findUserIdByStripe(customerId, sub.id);

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update({
      status: "canceled",
      tier: "free",
      updated_at: new Date().toISOString(),
    } as never)
    .eq("stripe_subscription_id", sub.id)
    .eq("environment" as never, env as never);
  if (error) console.error("[stripe-webhook] cancel error:", error);

  if (userId) {
    const email = await getUserEmail(userId);
    if (email) await sendEmail({ to: email, ...subscriptionCanceledEmail() });
  }
}

function amountLabel(invoice: Stripe.Invoice) {
  const amountPaid = (invoice as unknown as { amount_paid?: number }).amount_paid;
  if (typeof amountPaid !== "number") return undefined;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: (invoice.currency || "eur").toUpperCase(),
  }).format(amountPaid / 100);
}

async function sendInvoiceEmail(invoice: Stripe.Invoice, state: "paid" | "failed") {
  const rawInvoice = invoice as unknown as { customer?: string; subscription?: string };
  const userId = await findUserIdByStripe(rawInvoice.customer, rawInvoice.subscription);
  if (!userId) return;

  const email = await getUserEmail(userId);
  if (!email) return;

  const template = state === "paid" ? paymentSucceededEmail(amountLabel(invoice)) : paymentFailedEmail();
  const result = await sendEmail({ to: email, ...template });
  if (!result.ok) console.warn("[stripe-webhook] billing email not sent", result.error);
}
