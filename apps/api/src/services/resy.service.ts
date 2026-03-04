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
    const params = new URLSearchParams({
      venue_id: req.platformVenueId,
      day: req.date,
      num_seats: String(req.partySize),
    });

    const res = await fetch(`${this.baseUrl}/4/find?${params}`, {
      headers: this.headers,
    });

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

  async bookSlot(slot: Slot, paymentMethodId?: string): Promise<BookingResult> {
    if (!slot.slotToken || !slot.configId) {
      return { success: false, error: "Missing slot token", errorCode: "invalid_slot" };
    }

    const body: Record<string, unknown> = {
      book_token: slot.slotToken,
      struct_payment_method: paymentMethodId
        ? { id: paymentMethodId }
        : undefined,
    };

    const res = await fetch(`${this.baseUrl}/3/book`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (res.status === 429) {
      throw new ResyRateLimitError("Resy rate limit hit during booking");
    }

    const data = await res.json();

    if (!res.ok) {
      const errorCode = data.error?.code ?? "unknown";
      if (errorCode === "slot_taken" || res.status === 412) {
        return { success: false, error: "Slot no longer available", errorCode: "slot_taken" };
      }
      return { success: false, error: data.message ?? "Booking failed", errorCode };
    }

    return {
      success: true,
      reservationId: data.resy_token,
      confirmationNumber: data.reservation?.resy_token,
      slot,
    };
  }
}

export class ResyRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResyRateLimitError";
  }
}
