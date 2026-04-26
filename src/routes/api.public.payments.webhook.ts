import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyStripeWebhook, createStripeClient, type StripeEnv } from "@/server/stripe/client";
import type Stripe from "stripe";

/**
 * Webhook Stripe — reçoit les événements customer.subscription.* via le gateway.
 * URL : /api/public/payments/webhook?env=sandbox|live
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
          const event = await verifyStripeWebhook(request, env);

          switch (event.type) {
            case "customer.subscription.created":
            case "customer.subscription.updated":
              await upsertSubscription(event.data.object as unknown as Stripe.Subscription, env);
              break;
            case "customer.subscription.deleted":
              await cancelSubscription(event.data.object as unknown as Stripe.Subscription, env);
              break;
            default:
              // Événements non gérés : checkout.session.completed, invoice.*, etc.
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

function tierFromPrice(priceId: string | null | undefined): "pro" | "business" | "free" {
  if (!priceId) return "free";
  if (priceId.startsWith("aquagwada_pro") || priceId.includes("pro_")) return "pro";
  if (priceId.includes("business")) return "business";
  return "free";
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
    return (p.lookup_key as string | null) ?? internalPriceId;
  } catch {
    return internalPriceId;
  }
}

async function upsertSubscription(sub: Stripe.Subscription, env: StripeEnv) {
  const userId = (sub.metadata as Record<string, string> | null)?.userId;
  if (!userId) {
    console.error("[stripe-webhook] no userId in metadata");
    return;
  }
  const item = sub.items?.data?.[0];
  const internalPriceId = item?.price?.id ?? "";
  const productId = (item?.price?.product as string) ?? null;

  // Métadonnée Lovable (lookup_key humain) si présente, sinon résolution via API.
  const lovableId = (item?.price?.metadata as Record<string, string> | undefined)?.lovable_external_id;
  const humanPriceId = lovableId ?? (await resolveLookupKey(env, internalPriceId));

  type StripeSubscriptionItemBasil = Stripe.SubscriptionItem & {
    current_period_start?: number | null;
    current_period_end?: number | null;
  };
  type StripeSubscriptionFallback = Stripe.Subscription & {
    current_period_start?: number | null;
    current_period_end?: number | null;
  };
  const itemBasil = item as StripeSubscriptionItemBasil | undefined;
  const subFallback = sub as StripeSubscriptionFallback;
  const periodStart = itemBasil?.current_period_start ?? subFallback.current_period_start ?? null;
  const periodEnd = itemBasil?.current_period_end ?? subFallback.current_period_end ?? null;

  const tier = tierFromPrice(humanPriceId);
  const status = statusFromStripe(sub.status);

  const row = {
    user_id: userId,
    stripe_subscription_id: sub.id,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    product_id: productId,
    price_id: humanPriceId,
    status,
    tier,
    current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    environment: env,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(row as never, { onConflict: "stripe_subscription_id" });
  if (error) console.error("[stripe-webhook] upsert error:", error);
}

async function cancelSubscription(sub: Stripe.Subscription, env: StripeEnv) {
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
}