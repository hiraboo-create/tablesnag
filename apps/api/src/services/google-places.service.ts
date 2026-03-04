import type Redis from "ioredis";
import type { AutocompleteResult, PlaceDetails } from "@tablesnag/shared";
import { config } from "../config";

const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours

export class GooglePlacesService {
  private readonly apiKey: string;
  private readonly baseUrl = "https://maps.googleapis.com/maps/api/place";

  constructor(private readonly redis: Redis) {
    this.apiKey = config.GOOGLE_PLACES_API_KEY ?? "";
  }

  async autocomplete(
    query: string,
    sessionToken: string
  ): Promise<AutocompleteResult[]> {
    const params = new URLSearchParams({
      input: query,
      types: "restaurant|food|cafe|bar",
      sessiontoken: sessionToken,
      key: this.apiKey,
    });

    const res = await fetch(`${this.baseUrl}/autocomplete/json?${params}`);
    if (!res.ok) throw new Error(`Places autocomplete error: ${res.status}`);

    const data = await res.json();

    return (data.predictions ?? []).map((p: Record<string, unknown>) => ({
      placeId: p.place_id as string,
      description: p.description as string,
      structuredFormatting: {
        mainText: (p.structured_formatting as Record<string, string>)?.main_text ?? "",
        secondaryText: (p.structured_formatting as Record<string, string>)?.secondary_text ?? "",
      },
    }));
  }

  async getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
    const cacheKey = `places:details:${placeId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as PlaceDetails;
    }

    const params = new URLSearchParams({
      place_id: placeId,
      fields: [
        "place_id",
        "name",
        "formatted_address",
        "rating",
        "price_level",
        "photos",
        "types",
        "geometry",
        "formatted_phone_number",
        "website",
        "opening_hours",
      ].join(","),
      key: this.apiKey,
    });

    const res = await fetch(`${this.baseUrl}/details/json?${params}`);
    if (!res.ok) throw new Error(`Places details error: ${res.status}`);

    const data = await res.json();
    const r = data.result;
    if (!r) return null;

    const details: PlaceDetails = {
      placeId: r.place_id,
      name: r.name,
      address: r.formatted_address,
      rating: r.rating,
      priceLevel: r.price_level,
      photoReference: r.photos?.[0]?.photo_reference,
      types: r.types ?? [],
      location: {
        lat: r.geometry?.location?.lat ?? 0,
        lng: r.geometry?.location?.lng ?? 0,
      },
      phoneNumber: r.formatted_phone_number,
      website: r.website,
      openingHours: r.opening_hours
        ? {
            openNow: r.opening_hours.open_now ?? false,
            weekdayText: r.opening_hours.weekday_text ?? [],
          }
        : undefined,
    };

    await this.redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(details));
    return details;
  }

  getPhotoUrl(photoReference: string, maxWidth = 400): string {
    return `${this.baseUrl}/photo?maxwidth=${maxWidth}&photo_reference=${photoReference}&key=${this.apiKey}`;
  }
}
