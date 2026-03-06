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
  const hasResy = connections.some((c) => c.platform === "RESY" && c.isActive);

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

          {/* Resy bookmarklet helper */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-blue-800">Having trouble connecting Resy?</p>
            <p className="text-xs text-blue-700">
              1. Drag the button below to your bookmarks bar<br />
              2. Go to <strong>resy.com</strong> and log in<br />
              3. Click the bookmark — it will connect your account automatically
            </p>
            <a
              href={`javascript:(function(){var c={};document.cookie.split(';').forEach(function(x){var p=x.trim().split('=');c[p[0]]=decodeURIComponent(p.slice(1).join('='));});var t=c['authToken']||c['auth_token']||c['resy-auth-token'];if(!t){try{var s=localStorage.getItem('_resy-auth')||localStorage.getItem('resy-auth');if(s){var o=JSON.parse(s);t=o.token||o.authToken;}}catch(e){}}if(t){window.location.href='https://tablesnag.vercel.app/connect/resy?token='+encodeURIComponent(t);}else{alert('Could not find your Resy auth token. Make sure you are logged in at resy.com and try again.');}})();`}
              onClick={(e) => {
                e.preventDefault();
                alert("Drag this button to your bookmarks bar, then click it while on resy.com");
              }}
              className="inline-block bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded cursor-grab active:cursor-grabbing select-none"
              draggable
            >
              Connect Resy
            </a>
          </div>

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
          <h3 className="font-semibold text-gray-900">Payment Method</h3>

          {hasResy && (
            <div className="bg-green-50 border border-green-100 rounded-lg p-3 text-xs text-green-700">
              Cards added here are automatically registered on your connected Resy account — no
              separate setup needed.
            </div>
          )}

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
