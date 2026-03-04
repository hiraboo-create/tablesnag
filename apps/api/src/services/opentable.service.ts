import type { AvailabilityRequest, BookingResult, Slot } from "@tablesnag/shared";
import { config } from "../config";

interface OpenTableSlotRaw {
  date_time: string; // "2024-08-15T19:00:00"
  experience: { id: number; name: string } | null;
  offer?: { token: string };
}

export class OpenTableService {
  private readonly baseUrl = "https://www.opentable.com/widget/reservation";
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string
  ) {}

  private async ensureAccessToken(): Promise<void> {
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return;
    }

    const res = await fetch("https://oauth.opentable.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenTable auth failed: ${res.status}`);
    }

    const data = await res.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = new Date(Date.now() + (data.expires_in - 60) * 1000);
  }

  async getAvailability(req: AvailabilityRequest): Promise<Slot[]> {
    await this.ensureAccessToken();

    const params = new URLSearchParams({
      rid: req.platformVenueId,
      datetime: `${req.date}T${req.startTime}`,
      covers: String(req.partySize),
    });

    const res = await fetch(`${this.baseUrl}/counts?${params}`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`OpenTable availability error: ${res.status}`);
    }

    const data = await res.json();
    const slots: Slot[] = [];

    const [startH, startM] = req.startTime.split(":").map(Number);
    const [endH, endM] = req.endTime.split(":").map(Number);
    const startMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;

    for (const slot of data.availability ?? []) {
      const raw = slot as OpenTableSlotRaw;
      const dt = new Date(raw.date_time);
      const time = dt.toTimeString().slice(0, 5);
      const [slotH, slotM] = time.split(":").map(Number);
      const slotMins = slotH * 60 + slotM;

      if (slotMins >= startMins && slotMins <= endMins) {
        slots.push({
          date: req.date,
          time,
          partySize: req.partySize,
          reservationId: raw.offer?.token,
        });
      }
    }

    return slots;
  }

  async bookSlot(
    slot: Slot,
    userId: string,
    userEmail: string,
    userName: string,
    paymentMethodId?: string
  ): Promise<BookingResult> {
    await this.ensureAccessToken();

    const body: Record<string, unknown> = {
      restaurant_id: slot.reservationId, // offer token used as booking ref
      date_time: `${slot.date}T${slot.time}`,
      covers: slot.partySize,
      first_name: userName.split(" ")[0] ?? userName,
      last_name: userName.split(" ").slice(1).join(" ") || "Guest",
      email: userEmail,
      offer_token: slot.reservationId,
    };

    if (paymentMethodId) {
      body.payment_method_id = paymentMethodId;
    }

    const res = await fetch(`${this.baseUrl}/create`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status === 409) {
      return { success: false, error: "Slot already taken", errorCode: "slot_taken" };
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data.message ?? "Booking failed", errorCode: String(res.status) };
    }

    const data = await res.json();
    return {
      success: true,
      reservationId: data.reservation_id ?? data.id,
      confirmationNumber: data.confirmation_number,
      slot,
    };
  }
}
