import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createStripeClient, type StripeEnv } from "@/server/stripe/client";
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

    // Récupère l'email pour pré-remplir le checkout
    const { data: userData } = await supabase.auth.getUser();
    const customerEmail = userData?.user?.email ?? undefined;

    // Résoudre le prix par lookup_key (humain : "pro_monthly")
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
    if (!sub?.stripe_customer_id) throw new Error("Aucun abonnement actif");

    const stripe = createStripeClient(env);
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: data.returnUrl,
    });
    return { url: portal.url };
  });