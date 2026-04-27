import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createStripeClient, type StripeEnv } from "@/server/stripe/client";
import type Stripe from "stripe";
import { z } from "zod";

const InputSchema = z.object({
  priceId: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  environment: z.enum(["sandbox", "live"]),
  returnUrl: z.string().url().max(500),
});

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const env: StripeEnv = data.environment;
    const stripe = createStripeClient(env);

    const { data: userData } = await supabase.auth.getUser();
    const customerEmail = userData?.user?.email ?? undefined;

    const prices = await stripe.prices.list({
      lookup_keys: [data.priceId],
      limit: 1,
      expand: ["data.product"],
    });
    if (!prices.data.length) throw new Error("Price not found");
    const price = prices.data[0];
    const isRecurring = price.type === "recurring";

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: price.id, quantity: 1 }],
      mode: isRecurring ? "subscription" : "payment",
      ui_mode: "embedded",
      return_url: data.returnUrl,
      ...(customerEmail && { customer_email: customerEmail }),
      metadata: { userId },
      ...(isRecurring && { subscription_data: { metadata: { userId } } }),
    });

    return { clientSecret: session.client_secret };
  });

const PortalInputSchema = z.object({
  environment: z.enum(["sandbox", "live"]),
  returnUrl: z.string().url().max(500),
});

export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PortalInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const env: StripeEnv = data.environment;

    const { data: sub, error } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .eq("environment" as never, env as never)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!sub?.stripe_customer_id) throw new Error("Aucun abonnement Stripe actif pour ce compte.");

    const stripe = createStripeClient(env);
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: data.returnUrl,
    });
    return { url: portal.url };
  });

const SyncCheckoutInputSchema = z.object({
  sessionId: z.string().min(5).max(200),
  environment: z.enum(["sandbox", "live"]),
});

export const syncCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SyncCheckoutInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const stripe = createStripeClient(data.environment);
    const session = await stripe.checkout.sessions.retrieve(data.sessionId, {
      expand: ["subscription"],
    });

    const subscription = session.subscription;
    if (!subscription) throw new Error("Abonnement Stripe introuvable.");

    const sub = typeof subscription === "string"
      ? await stripe.subscriptions.retrieve(subscription)
      : subscription as Stripe.Subscription;

    const metadataUserId = session.metadata?.userId || (sub.metadata as Record<string, string> | null)?.userId;
    if (metadataUserId !== context.userId) {
      throw new Error("Cette session Stripe ne correspond pas au compte connecte.");
    }

    await upsertSubscriptionFromStripe(stripe, sub, data.environment, context.userId);
    return { ok: true };
  });

function statusFromStripe(status: string): "active" | "trialing" | "past_due" | "canceled" | "expired" {
  if (status === "active" || status === "trialing" || status === "past_due" || status === "canceled") return status;
  if (status === "unpaid" || status === "incomplete_expired") return "expired";
  return "active";
}

function tierFromPrice(priceId: string | null | undefined): "pro" | "business" | "free" {
  if (!priceId) return "free";
  if (priceId === "pro_monthly" || priceId.startsWith("aquagwada_pro") || priceId.includes("pro_")) return "pro";
  if (priceId.includes("business")) return "business";
  return "pro";
}

async function resolveLookupKey(stripe: Stripe, internalPriceId: string): Promise<string> {
  try {
    const price = await stripe.prices.retrieve(internalPriceId);
    return price.lookup_key ?? internalPriceId;
  } catch {
    return internalPriceId;
  }
}

async function upsertSubscriptionFromStripe(stripe: Stripe, sub: Stripe.Subscription, env: StripeEnv, userId: string) {
  const item = sub.items?.data?.[0];
  const internalPriceId = item?.price?.id ?? "";
  const productId = typeof item?.price?.product === "string" ? item.price.product : null;
  const metadata = item?.price?.metadata as Record<string, string> | undefined;
  const humanPriceId = metadata?.lovable_external_id ?? item?.price?.lookup_key ?? await resolveLookupKey(stripe, internalPriceId);

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
  if (error) throw error;
}
