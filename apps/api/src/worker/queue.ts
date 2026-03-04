import { Queue } from "bullmq";
import { config } from "../config";

export const BOOKING_QUEUE = "booking";
export const JOB_NAME = "poll-and-book";

export interface BookingJobData {
  taskId: string;
  userId: string;
}

// BullMQ connection options from env — avoids ioredis version conflicts
export function getBullMQConnection() {
  const url = new URL(config.REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    username: url.username || undefined,
    password: url.password || undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let bookingQueue: Queue<BookingJobData, any, string> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getBookingQueue(): Queue<BookingJobData, any, string> {
  if (!bookingQueue) {
    bookingQueue = new Queue<BookingJobData>(BOOKING_QUEUE, {
      connection: getBullMQConnection(),
    });
  }
  return bookingQueue;
}

export function getPeakCron(): string {
  return "*/30 * 9-22 * * *"; // every 30 sec, 9AM-10:59PM
}

export function getOffPeakCron(): string {
  return "0 */5 0-8,23 * * *"; // every 5 min, midnight-9AM and 11PM-midnight
}
