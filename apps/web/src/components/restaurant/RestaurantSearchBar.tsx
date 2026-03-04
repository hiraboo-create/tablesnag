"use client";

import { useState, useRef } from "react";
import { useRestaurantSearch } from "@/hooks/useRestaurantSearch";
import type { AutocompleteResult } from "@tablesnag/shared";

interface Props {
  onSelect: (result: AutocompleteResult) => void;
}

export function RestaurantSearchBar({ onSelect }: Props) {
  const { query, setQuery, results, isLoading, resetSessionToken } = useRestaurantSearch();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSelect = (result: AutocompleteResult) => {
    setQuery(result.structuredFormatting.mainText);
    resetSessionToken();
    setOpen(false);
    onSelect(result);
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search for a restaurant..."
        className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 pr-10"
      />
      {isLoading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-red-500 rounded-full animate-spin" />
        </div>
      )}

      {open && results.length > 0 && (
        <ul className="absolute z-50 w-full bg-white mt-1 border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {results.map((result) => (
            <li
              key={result.placeId}
              onMouseDown={() => handleSelect(result)}
              className="px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
            >
              <div className="font-medium text-sm text-gray-900">
                {result.structuredFormatting.mainText}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {result.structuredFormatting.secondaryText}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
