import type { Platform, Slot } from "./platform";

export enum TaskStatus {
  MONITORING = "MONITORING",
  PAUSED = "PAUSED",
  BOOKED = "BOOKED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export interface BookingTask {
  id: string;
  userId: string;
  restaurantId: string;
  restaurantName: string;
  restaurantAddress: string | null;
  platforms: Platform[];
  partySize: number;
  dateRangeStart: string; // ISO date
  dateRangeEnd: string; // ISO date
  timeWindowStart: string; // "HH:MM"
  timeWindowEnd: string; // "HH:MM"
  status: TaskStatus;
  paymentMethodId: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Reservation {
  id: string;
  userId: string;
  taskId: string;
  platform: Platform;
  restaurantName: string;
  confirmationNumber: string | null;
  platformReservationId: string | null;
  partySize: number;
  date: string;
  time: string;
  status: ReservationStatus;
  bookedAt: string;
  slot: Slot | null;
}

export enum ReservationStatus {
  CONFIRMED = "CONFIRMED",
  CANCELLED = "CANCELLED",
  COMPLETED = "COMPLETED",
}
