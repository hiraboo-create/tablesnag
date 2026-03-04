import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fp from "fastify-plugin";
import { Worker } from "bullmq";
import Redis from "ioredis";

import { config } from "./config";
import prismaPlugin from "./plugins/prisma";
import redisPlugin from "./plugins/redis";
import authPlugin from "./plugins/auth";

import { healthRoutes } from "./routes/health";
import { authRoutes } from "./routes/auth";
import { connectionRoutes } from "./routes/connections";
import { paymentMethodRoutes } from "./routes/paymentMethods";
import { taskRoutes } from "./routes/tasks";
import { reservationRoutes } from "./routes/reservations";
import { restaurantRoutes } from "./routes/restaurants";

import { scheduleActiveTasks } from "./worker/scheduler";
import { processBookingJob } from "./worker/booking.processor";
import { BOOKING_QUEUE, JOB_NAME } from "./worker/queue";
import type { BookingJobData } from "./worker/queue";

const fastify = Fastify({
  logger: {
    level: config.NODE_ENV === "production" ? "warn" : "info",
    transport:
      config.NODE_ENV !== "production"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
  },
});

async function buildApp() {
  await fastify.register(cors, {
    origin: process.env.NEXTAUTH_URL ?? "http://localhost:3000",
    credentials: true,
  });

  await fastify.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: "1 minute",
    keyGenerator: (req) => req.ip,
  });

  await fastify.register(prismaPlugin);
  await fastify.register(redisPlugin);
  await fastify.register(authPlugin);

  await fastify.register(healthRoutes);
  await fastify.register(authRoutes);
  await fastify.register(connectionRoutes);
  await fastify.register(paymentMethodRoutes);
  await fastify.register(taskRoutes);
  await fastify.register(reservationRoutes);

  // Restaurant routes with per-user rate limit
  await fastify.register(
    fp(async (instance) => {
      await instance.register(rateLimit, {
        max: 20,
        timeWindow: "1 minute",
        keyGenerator: (req) => {
          const user = (req as unknown as { user?: { sub: string } }).user;
          return user?.sub ?? req.ip;
        },
      });
      await instance.register(restaurantRoutes);
    })
  );
}

async function startWorker() {
  const workerRedis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

  const worker = new Worker<BookingJobData>(
    BOOKING_QUEUE,
    async (job) => {
      await processBookingJob(job, fastify.prisma, fastify.redis);
    },
    {
      connection: workerRedis,
      concurrency: 5,
    }
  );

  worker.on("failed", (job, err) => {
    fastify.log.error({ jobId: job?.id, err }, "Booking job failed");
  });

  return worker;
}

async function main() {
  await buildApp();
  await fastify.listen({ port: config.PORT, host: "0.0.0.0" });
  fastify.log.info(`API listening on port ${config.PORT}`);

  await scheduleActiveTasks(fastify.prisma, fastify.redis);
  await startWorker();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
