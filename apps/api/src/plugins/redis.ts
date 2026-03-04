import fp from "fastify-plugin";
import Redis from "ioredis";
import { config } from "../config";

declare module "fastify" {
  interface FastifyInstance {
    redis: Redis;
  }
}

export default fp(async (fastify) => {
  const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  });

  redis.on("error", (err) => {
    fastify.log.error({ err }, "Redis connection error");
  });

  await new Promise<void>((resolve, reject) => {
    redis.once("ready", resolve);
    redis.once("error", reject);
  });

  fastify.decorate("redis", redis);

  fastify.addHook("onClose", async () => {
    await redis.quit();
  });
});
