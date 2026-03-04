import { Queue, Worker, QueueEvents } from "bullmq";
import type Redis from "ioredis";

export const BOOKING_QUEUE = "booking";
export const JOB_NAME = "poll-and-book";

export interface BookingJobData {
  taskId: string;
  userId: string;
}

let bookingQueue: Queue<BookingJobData> | null = null;

export function getBookingQueue(connection: Redis): Queue<BookingJobData> {
  if (!bookingQueue) {
    bookingQueue = new Queue<BookingJobData>(BOOKING_QUEUE, { connection });
  }
  return bookingQueue;
}

export function makeRepeatableJobKey(taskId: string): string {
  return `task:${taskId}`;
}

/**
 * Calculate the cron schedule for a booking task.
 * Peak hours (9AM-11PM): every 30 seconds.
 * Off-peak: every 5 minutes.
 * We use two separate repeatable jobs with different cron expressions.
 */
export function getPeakCron(): string {
  return "*/30 * 9-22 * * *"; // every 30 sec, 9AM-10:59PM
}

export function getOffPeakCron(): string {
  return "0 */5 0-8,23 * * *"; // every 5 min, midnight-9AM and 11PM-midnight
}
