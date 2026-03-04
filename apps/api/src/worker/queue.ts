import { Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";

export const BOOKING_QUEUE = "booking";
export const JOB_NAME = "poll-and-book";

export interface BookingJobData {
  taskId: string;
  userId: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let bookingQueue: Queue<BookingJobData, any, string> | null = null;

export function getBookingQueue(
  connection: ConnectionOptions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Queue<BookingJobData, any, string> {
  if (!bookingQueue) {
    bookingQueue = new Queue<BookingJobData>(BOOKING_QUEUE, { connection });
  }
  return bookingQueue;
}

export function getPeakCron(): string {
  return "*/30 * 9-22 * * *"; // every 30 sec, 9AM-10:59PM
}

export function getOffPeakCron(): string {
  return "0 */5 0-8,23 * * *"; // every 5 min, midnight-9AM and 11PM-midnight
}
