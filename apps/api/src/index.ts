import "dotenv/config";
import { Worker } from "bullmq";
import Redis from "ioredis";

import { config } from "./config";
import { buildApp } from "./app";
import { scheduleActiveTasks } from "./worker/scheduler";
import { processBookingJob } from "./worker/booking.processor";
import { BOOKING_QUEUE } from "./worker/queue";
import type { BookingJobData } from "./worker/queue";

async function main() {
  const app = await buildApp();

  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  app.log.info(`API listening on port ${config.PORT}`);

  await scheduleActiveTasks(app.prisma, app.redis);

  const workerRedis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
  const worker = new Worker<BookingJobData>(
    BOOKING_QUEUE,
    async (job) => {
      await processBookingJob(job, app.prisma, app.redis);
    },
    { connection: workerRedis, concurrency: 5 }
  );

  worker.on("failed", (job, err) => {
    app.log.error({ jobId: job?.id, err }, "Booking job failed");
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
