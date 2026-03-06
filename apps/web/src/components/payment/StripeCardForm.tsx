"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { api } from "@/lib/api";

const RESY_STRIPE_KEY =
  "pk_live_51JdK5FIqT2RuI7QtpZsqeG1GTMZHBTBCTr4r1MZkJJt60ybz3REl92I0uKIynSMIUMXkUlMGAU8B5pRJ0533KImO0006EPpHUI";

// Lazy-loaded Stripe instances (one per account)
let ourStripePromise: ReturnType<typeof loadStripe> | null = null;
let resyStripePromise: ReturnType<typeof loadStripe> | null = null;

function getOurStripe() {
  if (!ourStripePromise)
    ourStripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");
  return ourStripePromise;
}

function getResyStripe() {
  if (!resyStripePromise) resyStripePromise = loadStripe(RESY_STRIPE_KEY);
  return resyStripePromise;
}

interface Props {
  onSuccess: () => void;
}

export function StripeCardForm({ onSuccess }: Props) {
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatCardNumber = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(.{4})/g, "$1 ").trim();
  };

  const formatExpiry = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 4);
    if (digits.length > 2) return digits.slice(0, 2) + "/" + digits.slice(2);
    return digits;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const rawNumber = cardNumber.replace(/\s/g, "");
      const [monthStr, yearStr] = expiry.split("/");
      const expMonth = parseInt(monthStr ?? "0", 10);
      const expYear = parseInt("20" + (yearStr ?? "0"), 10);

      if (!rawNumber || rawNumber.length < 13 || !expMonth || !expYear || !cvc) {
        throw new Error("Please fill in all card details");
      }

      const cardData = { number: rawNumber, exp_month: expMonth, exp_year: expYear, cvc };
      const pmArgs = {
        type: "card",
        card: cardData,
        billing_details: { name: name || undefined },
      };

      // ── Tokenize on our Stripe account ───────────────────────────
      const ourStripe = await getOurStripe();
      if (!ourStripe) throw new Error("Stripe failed to load");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { paymentMethod: ourPM, error: ourError } = await (ourStripe as any).createPaymentMethod(pmArgs) as Awaited<ReturnType<typeof ourStripe.createPaymentMethod>>;
      if (ourError) throw new Error(ourError.message ?? "Card declined");

      // ── Tokenize on Resy's Stripe account (best-effort) ──────────
      let resyStripePaymentMethodId: string | undefined;
      try {
        const resyStripe = await getResyStripe();
        if (resyStripe) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { paymentMethod: resyPM } = await (resyStripe as any).createPaymentMethod(pmArgs) as Awaited<ReturnType<typeof resyStripe.createPaymentMethod>>;
          resyStripePaymentMethodId = resyPM?.id;
        }
      } catch {
        // Resy tokenization failure is non-fatal — card still saved to TableSnag
      }

      // ── Save to API ───────────────────────────────────────────────
      await api.post("/payment-methods", {
        paymentMethodId: ourPM!.id,
        resyStripePaymentMethodId,
      });

      setCardNumber("");
      setExpiry("");
      setCvc("");
      setName("");
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save card");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        <input
          type="text"
          placeholder="Card number"
          value={cardNumber}
          onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
          inputMode="numeric"
          autoComplete="cc-number"
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="MM/YY"
            value={expiry}
            onChange={(e) => setExpiry(formatExpiry(e.target.value))}
            inputMode="numeric"
            autoComplete="cc-exp"
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
          <input
            type="text"
            placeholder="CVC"
            value={cvc}
            onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            autoComplete="cc-csc"
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
        </div>
        <input
          type="text"
          placeholder="Name on card (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="cc-name"
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
      </div>
      {error && <p className="text-red-500 text-xs">{error}</p>}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-gray-900 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors"
      >
        {isLoading ? "Saving..." : "Save Card"}
      </button>
    </form>
  );
}
