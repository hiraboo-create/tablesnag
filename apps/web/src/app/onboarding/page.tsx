"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { PlatformConnectButton } from "@/components/platform/PlatformConnectButton";
import { StripeCardForm } from "@/components/payment/StripeCardForm";
import { Platform } from "@tablesnag/shared";

const STEPS = ["Connect Platforms", "Add Card", "Done"] as const;
type Step = (typeof STEPS)[number];

export default function OnboardingPage() {
  const router = useRouter();
  const { status } = useSession({ required: true });
  const [step, setStep] = useState<Step>("Connect Platforms");
  const [connectedPlatforms, setConnectedPlatforms] = useState<Platform[]>([]);

  if (status === "loading") return null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome to Table<span className="text-red-500">Snag</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">Set up your account in a few steps</p>
        </div>

        {/* Step indicator */}
        <div className="flex justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                  s === step
                    ? "bg-red-500 text-white"
                    : STEPS.indexOf(step) > i
                    ? "bg-green-500 text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {i + 1}
              </div>
              {i < STEPS.length - 1 && <div className="w-12 h-px bg-gray-200" />}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-5">
          {step === "Connect Platforms" && (
            <>
              <h2 className="text-lg font-semibold text-gray-900">Connect your accounts</h2>
              <p className="text-sm text-gray-500">
                Link your Resy and/or OpenTable accounts so TableSnag can book on your behalf.
              </p>
              <div className="space-y-3">
                {[Platform.RESY, Platform.OPENTABLE].map((platform) => (
                  <PlatformConnectButton
                    key={platform}
                    platform={platform}
                    connected={connectedPlatforms.includes(platform)}
                    onConnect={() =>
                      setConnectedPlatforms((prev) => [...prev, platform])
                    }
                  />
                ))}
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep("Add Card")}
                  disabled={connectedPlatforms.length === 0}
                  className="flex-1 bg-red-500 text-white rounded-lg py-2.5 font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  Continue
                </button>
                <button
                  onClick={() => setStep("Add Card")}
                  className="text-sm text-gray-400 hover:text-gray-600"
                >
                  Skip
                </button>
              </div>
            </>
          )}

          {step === "Add Card" && (
            <>
              <h2 className="text-lg font-semibold text-gray-900">Add a payment card</h2>
              <p className="text-sm text-gray-500">
                Some restaurants require a card to hold reservations. Your card is stored securely via Stripe.
              </p>
              <StripeCardForm onSuccess={() => setStep("Done")} />
              <button
                onClick={() => setStep("Done")}
                className="w-full text-sm text-gray-400 hover:text-gray-600 py-2"
              >
                Skip for now
              </button>
            </>
          )}

          {step === "Done" && (
            <div className="text-center space-y-4 py-4">
              <div className="text-4xl">🎉</div>
              <h2 className="text-lg font-semibold text-gray-900">You&apos;re all set!</h2>
              <p className="text-sm text-gray-500">
                Start creating booking tasks and we&apos;ll monitor for availability.
              </p>
              <button
                onClick={() => router.push("/dashboard")}
                className="w-full bg-red-500 text-white rounded-lg py-2.5 font-semibold hover:bg-red-600 transition-colors"
              >
                Go to Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
