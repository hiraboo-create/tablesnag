export interface Env {
  PROXY_SECRET: string;
}

const RESY_API_KEY = "VbWk7s3L4KiK5fzlO7JD3Q5EYolJI7n5";

function resyHeaders(authToken?: string): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `ResyAPI api_key="${RESY_API_KEY}"`,
    Origin: "https://resy.com",
    Referer: "https://resy.com/",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
  };
  if (authToken) h["X-Resy-Auth-Token"] = authToken;
  return h;
}

function otHeaders(): Record<string, string> {
  return {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Origin: "https://www.opentable.com",
    Referer: "https://www.opentable.com/",
  };
}

function jsonResp(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const secret = request.headers.get("X-Proxy-Secret");
    if (!secret || secret !== env.PROXY_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // ── Resy auth ────────────────────────────────────────────────
    if (request.method === "POST" && path === "/") {
      return handleResyAuth(request);
    }

    // ── Resy venue search ────────────────────────────────────────
    // GET /resy/venues?query=X&lat=Y&lon=Z
    if (request.method === "GET" && path === "/resy/venues") {
      const query = url.searchParams.get("query") ?? "";
      const lat = url.searchParams.get("lat") ?? "";
      const lon = url.searchParams.get("lon") ?? "";
      const params = new URLSearchParams({
        query,
        "geo[latitude]": lat,
        "geo[longitude]": lon,
      });
      const res = await fetch(`https://api.resy.com/3/venues?${params}`, {
        headers: resyHeaders(),
      });
      const body = await res.text();
      return new Response(body, {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── Resy venue by slug ───────────────────────────────────────
    // GET /resy/venue?url_slug=X&location=Y  (no auth needed)
    if (request.method === "GET" && path === "/resy/venue") {
      const urlSlug = url.searchParams.get("url_slug") ?? "";
      const location = url.searchParams.get("location") ?? "new-york-ny";
      const params = new URLSearchParams({ url_slug: urlSlug, location });
      const res = await fetch(`https://api.resy.com/3/venue?${params}`, {
        headers: resyHeaders(),
      });
      const body = await res.text();
      return new Response(body, {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── Resy availability ────────────────────────────────────────
    // GET /resy/find?venue_id=X&day=Y&num_seats=Z&lat=A&lon=B  (X-Resy-Auth-Token forwarded)
    if (request.method === "GET" && path === "/resy/find") {
      const authToken = request.headers.get("X-Resy-Auth-Token") ?? "";
      const numSeats =
        url.searchParams.get("num_seats") ??
        url.searchParams.get("party_size") ??
        "2";
      const p: Record<string, string> = {
        venue_id: url.searchParams.get("venue_id") ?? "",
        day: url.searchParams.get("day") ?? "",
        party_size: numSeats, // /4/find uses party_size
      };
      // lat/long are required by /4/find
      const lat = url.searchParams.get("lat");
      const lon = url.searchParams.get("lon");
      if (lat) p.lat = lat;
      if (lon) p.long = lon;
      const params = new URLSearchParams(p);
      const res = await fetch(`https://api.resy.com/4/find?${params}`, {
        headers: resyHeaders(authToken),
      });
      const body = await res.text();
      return new Response(body, {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── Resy user profile (includes saved payment methods) ───────
    // GET /resy/user
    if (request.method === "GET" && path === "/resy/user") {
      const authToken = request.headers.get("X-Resy-Auth-Token") ?? "";
      const res = await fetch("https://api.resy.com/3/user", {
        headers: resyHeaders(authToken),
      });
      const body = await res.text();
      return new Response(body, {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── Resy: register a Stripe PaymentMethod on Resy's account ──
    // POST /resy/stripe-payment-method  body: { payment_method_id: "pm_xxx" }
    if (request.method === "POST" && path === "/resy/stripe-payment-method") {
      const authToken = request.headers.get("X-Resy-Auth-Token") ?? "";
      const body = (await request.json()) as { payment_method_id: string };
      const formData = new URLSearchParams();
      formData.set("payment_method_id", body.payment_method_id);
      const res = await fetch("https://api.resy.com/3/stripe/payment_method", {
        method: "POST",
        headers: {
          ...resyHeaders(authToken),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData,
      });
      const resBody = await res.text();
      return new Response(resBody, {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── Resy slot details (exchanges slot token for book_token) ──
    // POST /resy/details  body: { config_id, day, party_size }
    if (request.method === "POST" && path === "/resy/details") {
      const authToken = request.headers.get("X-Resy-Auth-Token") ?? "";
      const body = (await request.json()) as {
        config_id: string;
        day: string;
        party_size: number;
      };
      const res = await fetch("https://api.resy.com/3/details", {
        method: "POST",
        headers: { ...resyHeaders(authToken), "Content-Type": "application/json" },
        body: JSON.stringify({
          config_id: body.config_id,
          day: body.day,
          party_size: body.party_size,
        }),
      });
      const resBody = await res.text();
      return new Response(resBody, {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── Resy booking ─────────────────────────────────────────────
    // POST /resy/book  { book_token, struct_payment_method? }
    // Resy's /3/book uses application/x-www-form-urlencoded
    if (request.method === "POST" && path === "/resy/book") {
      const authToken = request.headers.get("X-Resy-Auth-Token") ?? "";
      const body = (await request.json()) as {
        book_token: string;
        struct_payment_method?: unknown;
        source_id?: string;
      };
      const formData = new URLSearchParams();
      formData.set("book_token", body.book_token);
      if (body.struct_payment_method) {
        formData.set("struct_payment_method", JSON.stringify(body.struct_payment_method));
      }
      formData.set("source_id", body.source_id ?? "resy.com-venue-details");

      const res = await fetch("https://api.resy.com/3/book", {
        method: "POST",
        headers: {
          ...resyHeaders(authToken),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData,
      });
      const resBody = await res.text();
      return new Response(resBody, {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── OpenTable restaurant search ──────────────────────────────
    // GET /opentable/search?query=X&lat=Y&lon=Z
    if (request.method === "GET" && path === "/opentable/search") {
      const query = url.searchParams.get("query") ?? "";
      const lat = url.searchParams.get("lat") ?? "";
      const lon = url.searchParams.get("lon") ?? "";

      // Try OT's restref widget search endpoint first
      const params1 = new URLSearchParams({
        term: query,
        latitude: lat,
        longitude: lon,
        covers: "2",
      });
      const res1 = await fetch(
        `https://www.opentable.com/restref/api/restaurant/search?${params1}`,
        { headers: otHeaders() }
      );
      if (res1.ok) {
        const body = await res1.text();
        return new Response(body, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Fallback: try OT's dapi search endpoint
      const params2 = new URLSearchParams({
        q: query,
        latitude: lat,
        longitude: lon,
        covers: "2",
      });
      const res2 = await fetch(
        `https://www.opentable.com/dapi/search/solr_listings?${params2}`,
        { headers: otHeaders() }
      );
      if (res2.ok) {
        const body = await res2.text();
        return new Response(body, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Both failed — return the last status so caller knows
      return jsonResp(
        { error: `OpenTable search unavailable (HTTP ${res2.status})` },
        res2.status
      );
    }

    // ── OpenTable availability ───────────────────────────────────
    // GET /opentable/availability?rid=X&party_size=Y&date=YYYY-MM-DD&time=HH:MM
    if (request.method === "GET" && path === "/opentable/availability") {
      const rid = url.searchParams.get("rid") ?? "";
      const party_size = url.searchParams.get("party_size") ?? "2";
      const date = url.searchParams.get("date") ?? "";
      const time = url.searchParams.get("time") ?? "19:00";

      const params = new URLSearchParams({
        rid,
        party_size,
        date,
        time,
        attribution_referrer: "https://www.opentable.com/",
      });
      const res = await fetch(
        `https://www.opentable.com/restref/api/availability?${params}`,
        { headers: otHeaders() }
      );
      const body = await res.text();
      return new Response(body, {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};

// ── Handlers ─────────────────────────────────────────────────────

async function handleResyAuth(request: Request): Promise<Response> {
  let email: string, password: string;
  try {
    const body = (await request.json()) as { email: string; password: string };
    email = body.email;
    password = body.password;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const resyRes = await fetch("https://api.resy.com/3/auth/password", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `ResyAPI api_key="${RESY_API_KEY}"`,
      Origin: "https://resy.com",
      Referer: "https://resy.com/",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
    },
    body: new URLSearchParams({ email, password }),
  });

  const resyBody = await resyRes.text();
  return new Response(resyBody, {
    status: resyRes.status,
    headers: { "Content-Type": "application/json" },
  });
}
