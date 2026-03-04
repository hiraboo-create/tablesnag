import type Redis from "ioredis";
import type { AutocompleteResult, PlaceDetails } from "@tablesnag/shared";
import { config } from "../config";

const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const YELP_BASE = "https://api.yelp.com/v3";

interface YelpBusiness {
  id: string;
  name: string;
  location: {
    display_address: string[];
    city: string;
    state: string;
  };
  rating?: number;
  price?: string; // "$", "$$", "$$$", "$$$$"
  image_url?: string;
  categories?: Array<{ alias: string; title: string }>;
  coordinates?: { latitude: number; longitude: number };
  phone?: string;
  url?: string;
  hours?: Array<{ is_open_now: boolean; open: unknown[] }>;
}

function priceToLevel(price?: string): number | undefined {
  if (!price) return undefined;
  return price.length; // "$"=1, "$$"=2, "$$$"=3, "$$$$"=4
}

export class GooglePlacesService {
  private readonly apiKey: string;

  constructor(private readonly redis: Redis) {
    this.apiKey = config.YELP_API_KEY ?? "";
  }

  private get headers() {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  async autocomplete(query: string, _sessionToken: string): Promise<AutocompleteResult[]> {
    if (!this.apiKey) return [];

    const params = new URLSearchParams({
      term: query,
      location: "United States",
      categories: "restaurants,food,bars",
      limit: "10",
    });

    const res = await fetch(`${YELP_BASE}/businesses/search?${params}`, {
      headers: this.headers,
    });

    if (!res.ok) return [];

    const data = await res.json();
    const businesses: YelpBusiness[] = data.businesses ?? [];

    return businesses.map((b) => ({
      placeId: b.id,
      description: `${b.name}, ${b.location.city}, ${b.location.state}`,
      structuredFormatting: {
        mainText: b.name,
        secondaryText: b.location.display_address.join(", "),
      },
    }));
  }

  async getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
    const cacheKey = `yelp:details:${placeId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as PlaceDetails;

    if (!this.apiKey) return null;

    const res = await fetch(`${YELP_BASE}/businesses/${encodeURIComponent(placeId)}`, {
      headers: this.headers,
    });

    if (!res.ok) return null;

    const b: YelpBusiness = await res.json();

    const details: PlaceDetails = {
      placeId: b.id,
      name: b.name,
      address: b.location.display_address.join(", "),
      rating: b.rating,
      priceLevel: priceToLevel(b.price),
      photoUrl: b.image_url,
      types: (b.categories ?? []).map((c) => c.alias),
      location: {
        lat: b.coordinates?.latitude ?? 0,
        lng: b.coordinates?.longitude ?? 0,
      },
      phoneNumber: b.phone,
      website: b.url,
      openingHours: b.hours?.[0]
        ? { openNow: b.hours[0].is_open_now, weekdayText: [] }
        : undefined,
    };

    await this.redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(details));
    return details;
  }
}
