import "dotenv/config";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fp from "fastify-plugin";

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

export async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: config.NODE_ENV === "production" ? "warn" : "info",
      transport:
        config.NODE_ENV !== "production"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
  });

  await fastify.register(cors, {
    origin: true,
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

  // Restaurant routes with stricter per-user rate limit
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

  return fastify;
}
