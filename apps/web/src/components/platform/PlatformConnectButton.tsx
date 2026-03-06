"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Platform, PLATFORM_LABELS } from "@tablesnag/shared";

interface Props {
  platform: Platform;
  connected: boolean;
  onConnect: () => void;
}

const PLATFORM_ICONS: Record<Platform, string> = {
  [Platform.RESY]: "🔴",
  [Platform.OPENTABLE]: "🟡",
};

// Public API keys (already embedded in their own frontend JS)
const RESY_API_KEY = "VbWk7s3L4KiK5fzlO7JD3Q5EYolJI7n5";

async function resyLoginFromBrowser(email: string, password: string): Promise<{ token: string; platformUserId: string }> {
  const res = await fetch("https://api.resy.com/3/auth/password", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `ResyAPI api_key="${RESY_API_KEY}"`,
    },
    body: new URLSearchParams({ email, password }),
  });

  if (res.status === 419 || res.status === 401 || res.status === 422) {
    throw new Error("Invalid Resy email or password");
  }
  if (!res.ok) {
    throw new Error(`Resy login failed (status ${res.status})`);
  }
  const data = await res.json();
  return { token: data.token, platformUserId: String(data.id ?? "") };
}

async function openTableLoginFromBrowser(email: string, password: string): Promise<{ token: string; platformUserId: string }> {
  const res = await fetch("https://www.opentable.com/api/auth/user/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, rememberMe: true }),
  });

  if (res.status === 401 || res.status === 422 || res.status === 403) {
    throw new Error("Invalid OpenTable email or password");
  }
  if (!res.ok) {
    throw new Error(`OpenTable login failed (status ${res.status})`);
  }
  const data = await res.json();
  const token: string = data.token ?? data.access_token ?? data.authToken ?? "";
  if (!token) throw new Error("OpenTable did not return a token");
  const platformUserId = String(data.id ?? data.userId ?? data.user?.id ?? "");
  return { token, platformUserId };
}

export function PlatformConnectButton({ platform, connected, onConnect }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [manualToken, setManualToken] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showManualToken, setShowManualToken] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isResy = platform === Platform.RESY;
  const isOpenTable = platform === Platform.OPENTABLE;
  const useCredentials = isResy || isOpenTable;

  const handleConnect = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (showManualToken) {
        // Save a manually-pasted token
        await api.post("/connections", {
          platform,
          authToken: manualToken.trim(),
          email: email.trim() || undefined,
        });
      } else if (isResy) {
        // Try browser-side first (avoids server IP blocks)
        try {
          const { token, platformUserId } = await resyLoginFromBrowser(email, password);
          await api.post("/connections", { platform, authToken: token, email, platformUserId });
        } catch (browserErr: unknown) {
          const msg = browserErr instanceof Error ? browserErr.message : "";
          // If CORS/network blocked the browser call, fall back to server-side
          if (msg.startsWith("Invalid") || msg.startsWith("Resy login failed")) {
            throw browserErr; // credential error — propagate as-is
          }
          // Network/CORS error — try server proxy
          await api.post("/connections/resy/login", { email, password });
        }
      } else if (isOpenTable) {
        try {
          const { token, platformUserId } = await openTableLoginFromBrowser(email, password);
          await api.post("/connections", { platform, authToken: token, email, platformUserId });
        } catch (browserErr: unknown) {
          const msg = browserErr instanceof Error ? browserErr.message : "";
          if (msg.startsWith("Invalid") || msg.startsWith("OpenTable login failed")) {
            throw browserErr;
          }
          await api.post("/connections/opentable/login", { email, password });
        }
      } else {
        await api.post("/connections", { platform, authToken: manualToken, email: email || undefined });
      }

      setShowForm(false);
      setShowManualToken(false);
      setEmail("");
      setPassword("");
      setManualToken("");
      onConnect();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      setError(msg);
      // If server-side also failed, prompt for manual token
      if (msg.includes("login failed") && (isResy || isOpenTable)) {
        setShowManualToken(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const canSubmit = showManualToken
    ? manualToken.trim().length > 0
    : useCredentials
    ? email.trim() && password.trim()
    : manualToken.trim().length > 0;

  return (
    <div className="border border-gray-100 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>{PLATFORM_ICONS[platform]}</span>
          <span className="font-medium text-gray-900">{PLATFORM_LABELS[platform]}</span>
          {connected && (
            <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
              Connected
            </span>
          )}
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setShowManualToken(false); setError(null); }}
          className="text-sm text-red-500 hover:text-red-600 font-medium"
        >
          {connected ? "Reconnect" : "Connect"}
        </button>
      </div>

      {showForm && (
        <div className="space-y-2">
          {showManualToken ? (
            <>
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                Auto-login couldn&apos;t reach {PLATFORM_LABELS[platform]} from the server.
                Paste your auth token below instead.
              </p>
              <input
                type="text"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder={`${PLATFORM_LABELS[platform]} auth token`}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Account email (optional)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <button
                onClick={() => { setShowManualToken(false); setError(null); }}
                className="text-xs text-gray-400 underline"
              >
                Try email/password again
              </button>
            </>
          ) : useCredentials ? (
            <>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={`${PLATFORM_LABELS[platform]} account email`}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={`${PLATFORM_LABELS[platform]} account password`}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <p className="text-xs text-gray-400">
                Your credentials are used once to get a session token and are never stored.
              </p>
              <button
                onClick={() => { setShowManualToken(true); setError(null); }}
                className="text-xs text-gray-400 underline"
              >
                Paste token manually instead
              </button>
            </>
          ) : (
            <>
              <input
                type="text"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Auth token"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Account email (optional)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </>
          )}
          {error && !showManualToken && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleConnect}
              disabled={isLoading || !canSubmit}
              className="flex-1 bg-red-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {isLoading ? "Connecting..." : "Connect"}
            </button>
            <button
              onClick={() => { setShowForm(false); setShowManualToken(false); setError(null); }}
              className="px-4 border border-gray-200 rounded-lg text-sm text-gray-500 hover:border-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
