"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { PlatformConnectButton } from "@/components/platform/PlatformConnectButton";
import { StripeCardForm } from "@/components/payment/StripeCardForm";
import { Platform } from "@tablesnag/shared";
import type { GetConnectionsResponse, GetPaymentMethodsResponse } from "@tablesnag/shared";

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
  }, [status, router]);

  const { data: connectionsData, mutate: mutateConnections } = useSWR(
    "/connections",
    (url: string) => api.get<GetConnectionsResponse>(url)
  );

  const { data: paymentData, mutate: mutatePayments } = useSWR(
    "/payment-methods",
    (url: string) => api.get<GetPaymentMethodsResponse>(url)
  );

  const connections = connectionsData?.data ?? [];
  const paymentMethods = paymentData?.data ?? [];

  if (status === "loading") return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">
          Table<span className="text-red-500">Snag</span>
        </h1>
        <button
          onClick={() => signOut({ callbackUrl: "/auth/login" })}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Sign out
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>

        {/* Account */}
        <section className="bg-white rounded-xl border border-gray-100 p-6 space-y-3">
          <h3 className="font-semibold text-gray-900">Account</h3>
          <div className="text-sm text-gray-600">
            <span className="text-gray-400">Email: </span>
            {session?.user?.email}
          </div>
        </section>

        {/* Platform connections */}
        <section className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <h3 className="font-semibold text-gray-900">Platform Connections</h3>
          {[Platform.RESY, Platform.OPENTABLE].map((platform) => {
            const conn = connections.find((c) => c.platform === platform);
            return (
              <PlatformConnectButton
                key={platform}
                platform={platform}
                connected={conn?.isActive ?? false}
                onConnect={() => mutateConnections()}
              />
            );
          })}
        </section>

        {/* Payment methods */}
        <section className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
          <h3 className="font-semibold text-gray-900">Payment Methods</h3>
          {paymentMethods.length === 0 ? (
            <p className="text-sm text-gray-400">No payment methods added.</p>
          ) : (
            <div className="space-y-2">
              {paymentMethods.map((pm) => (
                <div
                  key={pm.id}
                  className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                >
                  <div className="text-sm text-gray-700">
                    <span className="capitalize">{pm.brand}</span> ···· {pm.last4}
                    <span className="text-gray-400 ml-2">
                      {pm.expMonth}/{pm.expYear}
                    </span>
                    {pm.isDefault && (
                      <span className="ml-2 text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
                        Default
                      </span>
                    )}
                  </div>
                  <button
                    onClick={async () => {
                      await api.delete(`/payment-methods/${pm.id}`);
                      mutatePayments();
                    }}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <StripeCardForm onSuccess={() => mutatePayments()} />
        </section>
      </main>
    </div>
  );
}
