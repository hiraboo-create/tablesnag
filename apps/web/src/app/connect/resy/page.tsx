"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Platform } from "@tablesnag/shared";

function ConnectResyInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"saving" | "success" | "error">("saving");
  const [error, setError] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    const email = searchParams.get("email") ?? undefined;

    if (!token) {
      setStatus("error");
      setError("No token found in URL.");
      return;
    }

    api
      .post("/connections", { platform: Platform.RESY, authToken: token, email })
      .then(() => {
        setStatus("success");
        setTimeout(() => router.push("/settings"), 2000);
      })
      .catch((err: unknown) => {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Failed to save connection.");
      });
  }, [searchParams, router]);

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-8 max-w-sm w-full text-center space-y-4">
      <div className="text-4xl">{status === "success" ? "✅" : status === "error" ? "❌" : "⏳"}</div>
      <h1 className="text-xl font-bold text-gray-900">
        {status === "saving" && "Connecting Resy..."}
        {status === "success" && "Resy Connected!"}
        {status === "error" && "Connection Failed"}
      </h1>
      {status === "saving" && <p className="text-sm text-gray-500">Saving your Resy account...</p>}
      {status === "success" && <p className="text-sm text-gray-500">Redirecting to settings...</p>}
      {status === "error" && (
        <>
          <p className="text-sm text-red-500">{error}</p>
          <button onClick={() => router.push("/settings")} className="text-sm text-red-500 underline">
            Go to Settings
          </button>
        </>
      )}
    </div>
  );
}

export default function ConnectResyPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Suspense fallback={<div className="text-gray-400 text-sm">Loading...</div>}>
        <ConnectResyInner />
      </Suspense>
    </div>
  );
}
