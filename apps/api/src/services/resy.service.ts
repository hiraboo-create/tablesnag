import type { AvailabilityRequest, BookingResult, Slot } from "@tablesnag/shared";
import { config } from "../config";

interface ResySlotRaw {
  date: { start: string; end: string };
  config: { token: string; type: string; id: number };
  payment: { deposit_fee_in_cents?: number };
  quantity: number;
  shift_category: string;
}

export class ResyService {
  private readonly baseUrl = "https://api.resy.com";
  private readonly headers: Record<string, string>;

  constructor(private readonly authToken: string) {
    this.headers = {
      "Content-Type": "application/json",
      Authorization: `ResyAPI api_key="${config.RESY_API_KEY}"`,
      "X-Resy-Auth-Token": authToken,
    };
  }

  async getAvailability(req: AvailabilityRequest): Promise<Slot[]> {
    const paramObj: Record<string, string> = {
      venue_id: req.platformVenueId,
      day: req.date,
      num_seats: String(req.partySize),
    };
    if (req.lat != null) paramObj.lat = String(req.lat);
    if (req.lon != null) paramObj.lon = String(req.lon);
    const params = new URLSearchParams(paramObj);

    // Route through CF Worker proxy to bypass Resy's datacenter IP block
    let res: Response;
    if (config.RESY_PROXY_URL && config.RESY_PROXY_SECRET) {
      res = await fetch(`${config.RESY_PROXY_URL}/resy/find?${params}`, {
        headers: {
          "X-Proxy-Secret": config.RESY_PROXY_SECRET,
          "X-Resy-Auth-Token": this.authToken,
        },
      });
    } else {
      res = await fetch(`${this.baseUrl}/4/find?${params}`, {
        headers: this.headers,
      });
    }

    if (res.status === 429) {
      throw new ResyRateLimitError("Resy rate limit hit");
    }

    if (!res.ok) {
      throw new Error(`Resy availability error: ${res.status}`);
    }

    const data = await res.json();
    const slots: Slot[] = [];

    for (const venue of data.results?.venues ?? []) {
      for (const slot of venue.slots ?? []) {
        const raw = slot as ResySlotRaw;
        const startTime = new Date(raw.date.start);
        const time = startTime.toTimeString().slice(0, 5); // "HH:MM"

        // Filter by requested time window
        const [startH, startM] = req.startTime.split(":").map(Number);
        const [endH, endM] = req.endTime.split(":").map(Number);
        const [slotH, slotM] = time.split(":").map(Number);
        const startMins = startH * 60 + startM;
        const endMins = endH * 60 + endM;
        const slotMins = slotH * 60 + slotM;

        if (slotMins >= startMins && slotMins <= endMins) {
          slots.push({
            date: req.date,
            time,
            partySize: req.partySize,
            slotToken: raw.config.token,
            configId: String(raw.config.id),
            serviceTypeCode: raw.config.type,
          });
        }
      }
    }

    return slots;
  }

  /**
   * Exchange slot token → book token via /3/details, then confirm via /3/book.
   * Resy uses a two-step flow: details gives a short-lived book_token; book consumes it.
   */
  async bookSlot(slot: Slot, paymentMethodId?: string): Promise<BookingResult> {
    if (!slot.slotToken) {
      return { success: false, error: "Missing slot token", errorCode: "invalid_slot" };
    }

    // ── Step 1: exchange slot token for book_token ───────────────
    let bookToken: string;
    try {
      bookToken = await this.getBookToken(slot.slotToken, slot.date, slot.partySize);
    } catch (err) {
      return { success: false, error: `Failed to get book token: ${String(err)}`, errorCode: "details_failed" };
    }

    // ── Step 2: book ─────────────────────────────────────────────
    const body: Record<string, unknown> = {
      book_token: bookToken,
      source_id: "resy.com-venue-details",
    };
    if (paymentMethodId) {
      // Resy expects struct_payment_method.id as a number (their internal payment method ID)
      const pmId = /^\d+$/.test(paymentMethodId) ? parseInt(paymentMethodId, 10) : paymentMethodId;
      body.struct_payment_method = { id: pmId };
    }

    let res: Response;
    if (config.RESY_PROXY_URL && config.RESY_PROXY_SECRET) {
      res = await fetch(`${config.RESY_PROXY_URL}/resy/book`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Proxy-Secret": config.RESY_PROXY_SECRET,
          "X-Resy-Auth-Token": this.authToken,
        },
        body: JSON.stringify(body),
      });
    } else {
      const formData = new URLSearchParams();
      formData.set("book_token", bookToken);
      formData.set("source_id", "resy.com-venue-details");
      if (paymentMethodId) {
        const pmId = /^\d+$/.test(paymentMethodId) ? parseInt(paymentMethodId, 10) : paymentMethodId;
        formData.set("struct_payment_method", JSON.stringify({ id: pmId }));
      }
      res = await fetch(`${this.baseUrl}/3/book`, {
        method: "POST",
        headers: { ...this.headers, "Content-Type": "application/x-www-form-urlencoded" },
        body: formData,
      });
    }

    if (res.status === 429) {
      throw new ResyRateLimitError("Resy rate limit hit during booking");
    }

    const text = await res.text();
    const data = text ? JSON.parse(text) : {};

    if (!res.ok) {
      const msg = typeof data.message === "object"
        ? JSON.stringify(data.message)
        : (data.message ?? "Booking failed");
      if (res.status === 412 || String(msg).includes("slot_taken")) {
        return { success: false, error: "Slot no longer available", errorCode: "slot_taken" };
      }
      return { success: false, error: msg, errorCode: String(res.status) };
    }

    return {
      success: true,
      reservationId: data.resy_token,
      confirmationNumber: data.reservation_id ?? data.resy_token,
      slot,
    };
  }

  private async getBookToken(slotToken: string, day: string, partySize: number): Promise<string> {
    const payload = { config_id: slotToken, day, party_size: partySize };

    let res: Response;
    if (config.RESY_PROXY_URL && config.RESY_PROXY_SECRET) {
      res = await fetch(`${config.RESY_PROXY_URL}/resy/details`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Proxy-Secret": config.RESY_PROXY_SECRET,
          "X-Resy-Auth-Token": this.authToken,
        },
        body: JSON.stringify(payload),
      });
    } else {
      res = await fetch(`${this.baseUrl}/3/details`, {
        method: "POST",
        headers: { ...this.headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    if (!res.ok) throw new Error(`/3/details returned ${res.status}`);
    const data = await res.json();
    const bt = data?.book_token;
    const value = typeof bt === "object" ? bt?.value : bt;
    if (!value) throw new Error("No book_token in /3/details response");
    return value as string;
  }
}

export class ResyRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResyRateLimitError";
  }
}
