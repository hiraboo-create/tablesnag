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

export function PlatformConnectButton({ platform, connected, onConnect }: Props) {
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!token.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      await api.post("/connections", { platform, authToken: token, email: email || undefined });
      setShowForm(false);
      setToken("");
      setEmail("");
      onConnect();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setIsLoading(false);
    }
  };

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
          onClick={() => setShowForm(!showForm)}
          className="text-sm text-red-500 hover:text-red-600 font-medium"
        >
          {connected ? "Reconnect" : "Connect"}
        </button>
      </div>

      {showForm && (
        <div className="space-y-2">
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={`${PLATFORM_LABELS[platform]} auth token`}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={`${PLATFORM_LABELS[platform]} account email (optional)`}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleConnect}
              disabled={isLoading || !token.trim()}
              className="flex-1 bg-red-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {isLoading ? "Connecting..." : "Save"}
            </button>
            <button
              onClick={() => setShowForm(false)}
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
