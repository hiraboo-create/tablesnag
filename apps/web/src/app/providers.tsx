"use client";

import { SessionProvider } from "next-auth/react";
import { Elements } from "@stripe/react-stripe-js";
import { stripePromise } from "@/lib/stripe";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Elements stripe={stripePromise}>{children}</Elements>
    </SessionProvider>
  );
}
