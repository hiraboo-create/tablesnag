import type { FastifyInstance } from "fastify";

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/health", async (_req, reply) => {
    // Check DB and Redis
    let dbOk = false;
    let redisOk = false;

    try {
      await fastify.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {}

    try {
      await fastify.redis.ping();
      redisOk = true;
    } catch {}

    const healthy = dbOk && redisOk;
    return reply.status(healthy ? 200 : 503).send({
      status: healthy ? "ok" : "degraded",
      db: dbOk ? "ok" : "error",
      redis: redisOk ? "ok" : "error",
      timestamp: new Date().toISOString(),
    });
  });
}
