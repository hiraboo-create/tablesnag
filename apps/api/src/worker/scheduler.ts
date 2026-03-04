import type { PrismaClient } from "@prisma/client";
import type { Queue } from "bullmq";
import type Redis from "ioredis";
import { getBookingQueue, getPeakCron, getOffPeakCron, JOB_NAME } from "./queue";
import type { BookingJobData } from "./queue";

/**
 * On startup, enqueue repeatable BullMQ jobs for all MONITORING tasks.
 */
export async function scheduleActiveTasks(
  prisma: PrismaClient,
  redis: Redis
): Promise<void> {
  const queue = getBookingQueue(redis);

  const activeTasks = await prisma.bookingTask.findMany({
    where: { status: "MONITORING" },
    select: { id: true, userId: true },
  });

  for (const task of activeTasks) {
    await scheduleTask(queue, task.id, task.userId);
  }

  console.log(`Scheduled ${activeTasks.length} active booking tasks`);
}

export async function scheduleTask(
  queue: Queue<BookingJobData>,
  taskId: string,
  userId: string
): Promise<void> {
  const data: BookingJobData = { taskId, userId };

  await queue.add(JOB_NAME, data, {
    repeat: { pattern: getPeakCron() },
    jobId: `peak:${taskId}`,
  });

  await queue.add(JOB_NAME, data, {
    repeat: { pattern: getOffPeakCron() },
    jobId: `offpeak:${taskId}`,
  });
}

export async function removeTaskSchedule(
  queue: Queue<BookingJobData>,
  taskId: string
): Promise<void> {
  await queue.removeRepeatable(JOB_NAME, { pattern: getPeakCron() }, `peak:${taskId}`);
  await queue.removeRepeatable(JOB_NAME, { pattern: getOffPeakCron() }, `offpeak:${taskId}`);
}
