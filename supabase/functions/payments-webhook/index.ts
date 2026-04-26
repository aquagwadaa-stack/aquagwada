// Webhook Stripe (test + live) — reçoit les événements via le gateway Lovable.
// URL : https://<project>.supabase.co/functions/v1/payments-webhook?env=sandbox|live
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { type StripeEnv, verifyWebhook, createStripeClient } from "../_shared/stripe.ts";

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
  }
  return _supabase;
}

function tierFromPrice(priceId: string | null | undefined): "pro" | "business" | "free" {
  if (!priceId) return "free";
  if (priceId.includes("business")) return "business";
  if (priceId.includes("pro")) return "pro";
  return "free";
}

function statusFromStripe(s: string): string {
  if (["active", "trialing", "past_due", "canceled"].includes(s)) return s;
  if (s === "unpaid" || s === "incomplete_expired") return "expired";
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

async function upsertSub(sub: any, env: StripeEnv) {
  const userId = sub.metadata?.userId;
  if (!userId) {
    console.error("[webhook] no userId in metadata");
    return;
  }
  const item = sub.items?.data?.[0];
  const internalPriceId = item?.price?.id ?? "";
  const productId = item?.price?.product ?? null;
  const lovableId = item?.price?.metadata?.lovable_external_id;
  const humanPriceId = lovableId ?? (await resolveLookupKey(env, internalPriceId));

  const periodStart = item?.current_period_start ?? sub.current_period_start ?? null;
  const periodEnd = item?.current_period_end ?? sub.current_period_end ?? null;

  const tier = tierFromPrice(humanPriceId);
  const status = statusFromStripe(sub.status);

  const { error } = await getSupabase().from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: sub.id,
      stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
      product_id: productId,
      price_id: humanPriceId,
      status,
      tier,
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      environment: env,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );
  if (error) console.error("[webhook] upsert error:", error);
}

async function cancelSub(sub: any, env: StripeEnv) {
  const { error } = await getSupabase()
    .from("subscriptions")
    .update({ status: "canceled", tier: "free", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", sub.id)
    .eq("environment", env);
  if (error) console.error("[webhook] cancel error:", error);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawEnv = new URL(req.url).searchParams.get("env");
  if (rawEnv !== "sandbox" && rawEnv !== "live") {
    return new Response(JSON.stringify({ ignored: "invalid env" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  const env: StripeEnv = rawEnv;

  try {
    const event = await verifyWebhook(req, env);
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await upsertSub(event.data.object, env);
        break;
      case "customer.subscription.deleted":
        await cancelSub(event.data.object, env);
        break;
      default:
        console.log("[webhook] unhandled:", event.type);
    }
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[webhook] error:", e);
    return new Response("Webhook error", { status: 400 });
  }
});