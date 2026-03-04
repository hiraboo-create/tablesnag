export enum Platform {
  RESY = "RESY",
  OPENTABLE = "OPENTABLE",
}

export interface Slot {
  date: string; // ISO date string
  time: string; // "HH:MM"
  partySize: number;
  slotToken?: string; // Resy-specific booking token
  configId?: string; // Resy table config
  serviceTypeCode?: string; // Resy service type
  reservationId?: string; // OpenTable
}

export interface AvailabilityRequest {
  restaurantId: string;
  platformVenueId: string;
  date: string; // "YYYY-MM-DD"
  partySize: number;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
}

export interface BookingResult {
  success: boolean;
  reservationId?: string;
  confirmationNumber?: string;
  slot?: Slot;
  error?: string;
  errorCode?: string;
}
