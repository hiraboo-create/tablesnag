import { config } from "../config";

export interface PlatformVenueIds {
  RESY?: string;
  OPENTABLE?: string;
}

class VenueLookupService {
  private get proxyUrl() {
    return config.RESY_PROXY_URL;
  }
  private get proxySecret() {
    return config.RESY_PROXY_SECRET;
  }

  /**
   * Look up Resy's numeric venue ID for a given restaurant name + coordinates.
   *
   * Strategy:
   * 1. Try slug-based lookup (`/3/venue?url_slug=<name-slug>`) — exact match, fast.
   * 2. Fall back to geo+name search (`/3/venues?query=<name>&geo=...`) — fuzzy.
   *
   * Returns null if the proxy is unconfigured or the venue isn't found.
   */
  async lookupResyVenueId(
    name: string,
    lat: number,
    lon: number
  ): Promise<string | null> {
    if (!this.proxyUrl || !this.proxySecret) return null;

    // ── Strategy 1: slug lookup ──────────────────────────────────
    // Resy returns the venue object directly; id.resy holds the numeric ID.
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    try {
      const params = new URLSearchParams({ url_slug: slug });
      const res = await fetch(`${this.proxyUrl}/resy/venue?${params}`, {
        headers: { "X-Proxy-Secret": this.proxySecret! },
      });
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        const idObj = data?.id;
        if (idObj && typeof idObj === "object") {
          const resyId = (idObj as Record<string, unknown>).resy;
          if (resyId != null) return String(resyId);
        }
      }
    } catch {
      // fall through to strategy 2
    }

    // ── Strategy 2: geo+name search ──────────────────────────────
    const params = new URLSearchParams({
      query: name,
      lat: String(lat),
      lon: String(lon),
    });

    let data: unknown;
    try {
      const res = await fetch(`${this.proxyUrl}/resy/venues?${params}`, {
        headers: { "X-Proxy-Secret": this.proxySecret! },
      });
      if (!res.ok) return null;
      data = await res.json();
    } catch {
      return null;
    }

    const venues: unknown[] =
      (data as { results?: { venues?: unknown[] } })?.results?.venues ?? [];
    if (!venues.length) return null;

    // Pick the best-matching venue by name similarity
    const nameLower = name.toLowerCase().replace(/\s+/g, "");
    const scored = venues.map((v) => {
      const vName = ((v as Record<string, unknown>).name as string) ?? "";
      const vNameNorm = vName.toLowerCase().replace(/\s+/g, "");
      const score =
        vNameNorm === nameLower
          ? 2
          : vNameNorm.includes(nameLower) || nameLower.includes(vNameNorm)
          ? 1
          : 0;
      return { v, score };
    });
    scored.sort((a, b) => b.score - a.score);

    if (scored[0].score === 0) return null; // no plausible match

    const best = scored[0].v as Record<string, unknown>;
    const rawId = best.id;
    const id =
      rawId && typeof rawId === "object"
        ? ((rawId as Record<string, unknown>).resy as string | number)
        : (rawId as string | number);
    return id != null ? String(id) : null;
  }

  /**
   * Look up OpenTable's restaurant rid via the proxy Worker.
   * Returns null if the proxy is unconfigured, OT blocks the request,
   * or the venue isn't found.
   */
  async lookupOpenTableVenueId(
    name: string,
    lat: number,
    lon: number
  ): Promise<string | null> {
    if (!this.proxyUrl || !this.proxySecret) return null;

    const params = new URLSearchParams({
      query: name,
      lat: String(lat),
      lon: String(lon),
    });

    let data: unknown;
    try {
      const res = await fetch(`${this.proxyUrl}/opentable/search?${params}`, {
        headers: { "X-Proxy-Secret": this.proxySecret },
      });
      if (!res.ok) return null;
      data = await res.json();
    } catch {
      return null;
    }

    // OT search response shape varies; try common structures
    const restaurants: unknown[] =
      (data as { restaurants?: unknown[] })?.restaurants ??
      (data as { results?: unknown[] })?.results ??
      (Array.isArray(data) ? (data as unknown[]) : []);

    if (!restaurants.length) return null;

    const nameLower = name.toLowerCase().replace(/\s+/g, "");
    const scored = restaurants.map((r) => {
      const rName =
        ((r as Record<string, unknown>).name as string) ??
        ((r as Record<string, unknown>).restaurant_name as string) ??
        "";
      const rNameNorm = rName.toLowerCase().replace(/\s+/g, "");
      const score =
        rNameNorm === nameLower
          ? 2
          : rNameNorm.includes(nameLower) || nameLower.includes(rNameNorm)
          ? 1
          : 0;
      return { r, score };
    });
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0].r as Record<string, unknown>;
    const rid =
      (best.rid as string | number) ?? (best.id as string | number) ?? null;
    return rid != null ? String(rid) : null;
  }

  /**
   * Look up venue IDs for all requested platforms and return a map.
   */
  async lookupAll(
    platforms: string[],
    name: string,
    lat: number,
    lon: number
  ): Promise<PlatformVenueIds> {
    const result: PlatformVenueIds = {};

    await Promise.all(
      platforms.map(async (platform) => {
        if (platform === "RESY") {
          const id = await this.lookupResyVenueId(name, lat, lon);
          if (id) result.RESY = id;
        } else if (platform === "OPENTABLE") {
          const id = await this.lookupOpenTableVenueId(name, lat, lon);
          if (id) result.OPENTABLE = id;
        }
      })
    );

    return result;
  }
}

export const venueLookupService = new VenueLookupService();
