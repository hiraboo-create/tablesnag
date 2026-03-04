"use client";

import type { PlaceDetails } from "@tablesnag/shared";

const PRICE_SYMBOLS = ["", "$", "$$", "$$$", "$$$$"];
const STARS = ["", "★", "★★", "★★★", "★★★★", "★★★★★"];

interface Props {
  details: PlaceDetails;
}

export function RestaurantConfirmCard({ details }: Props) {
  const photoUrl = details.photoUrl ?? null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex gap-4">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={details.name}
          className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-20 h-20 rounded-lg bg-gray-100 flex-shrink-0 flex items-center justify-center text-2xl">
          🍽️
        </div>
      )}

      <div className="space-y-1 min-w-0">
        <h3 className="font-semibold text-gray-900 truncate">{details.name}</h3>
        <p className="text-sm text-gray-400 truncate">{details.address}</p>
        <div className="flex items-center gap-3 text-sm">
          {details.rating && (
            <span className="text-amber-500">
              {STARS[Math.round(details.rating)]} {details.rating.toFixed(1)}
            </span>
          )}
          {details.priceLevel !== undefined && (
            <span className="text-gray-500">{PRICE_SYMBOLS[details.priceLevel]}</span>
          )}
          {details.openingHours && (
            <span
              className={
                details.openingHours.openNow ? "text-green-600 text-xs" : "text-red-500 text-xs"
              }
            >
              {details.openingHours.openNow ? "Open now" : "Closed"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
