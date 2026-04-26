import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createCheckoutSession } from "@/server/payments/checkout";

interface Props {
  priceId: string;
  returnUrl: string;
}

export function StripeEmbeddedCheckoutForm({ priceId, returnUrl }: Props) {
  const fetchClientSecret = async (): Promise<string> => {
    const res = await createCheckoutSession({
      data: { priceId, returnUrl, environment: getStripeEnvironment() },
    });
    if (!res.clientSecret) throw new Error("Impossible de créer la session de paiement");
    return res.clientSecret;
  };

  return (
    <div id="checkout">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}