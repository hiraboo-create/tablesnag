"use client";

import { useState } from "react";
import { CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { api } from "@/lib/api";

interface Props {
  onSuccess: () => void;
}

export function StripeCardForm({ onSuccess }: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsLoading(true);
    setError(null);

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) return;

    const { error: stripeError, paymentMethod } = await stripe.createPaymentMethod({
      type: "card",
      card: cardElement,
    });

    if (stripeError) {
      setError(stripeError.message ?? "Card error");
      setIsLoading(false);
      return;
    }

    try {
      await api.post("/payment-methods", { paymentMethodId: paymentMethod.id });
      cardElement.clear();
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save card");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="border border-gray-300 rounded-lg px-4 py-3">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: "14px",
                color: "#111827",
                "::placeholder": { color: "#9ca3af" },
              },
            },
          }}
        />
      </div>
      {error && <p className="text-red-500 text-xs">{error}</p>}
      <button
        type="submit"
        disabled={isLoading || !stripe}
        className="w-full bg-gray-900 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors"
      >
        {isLoading ? "Saving..." : "Save Card"}
      </button>
    </form>
  );
}
