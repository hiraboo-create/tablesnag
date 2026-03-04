"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import type { AutocompleteResult, SearchRestaurantsResponse } from "@tablesnag/shared";

const DEBOUNCE_MS = 300;

export function useRestaurantSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AutocompleteResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionToken = useRef(crypto.randomUUID());
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<SearchRestaurantsResponse>(
        `/restaurants/search?query=${encodeURIComponent(q)}&sessionToken=${sessionToken.current}`
      );
      setResults(res.data);
    } catch (err) {
      setError("Search failed");
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      search(query);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query, search]);

  // Rotate session token after a selection (best practice for Places billing)
  const resetSessionToken = useCallback(() => {
    sessionToken.current = crypto.randomUUID();
  }, []);

  return {
    query,
    setQuery,
    results,
    isLoading,
    error,
    resetSessionToken,
  };
}
