import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { encryptionService } from "../services/encryption.service";
import { Platform } from "@tablesnag/shared";

const connectSchema = z.object({
  platform: z.nativeEnum(Platform),
  authToken: z.string().min(1),
  email: z.string().email().optional(),
  platformUserId: z.string().optional(),
});

export async function connectionRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /connections
  fastify.get(
    "/connections",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const connections = await fastify.prisma.platformConnection.findMany({
        where: { userId: req.user.sub },
        select: {
          id: true,
          platform: true,
          platformUserId: true,
          platformEmail: true,
          isActive: true,
          connectedAt: true,
        },
      });
      return reply.send({ data: connections });
    }
  );

  // POST /connections
  fastify.post(
    "/connections",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const body = connectSchema.safeParse(req.body);
      if (!body.success) {
        return reply.status(400).send({ error: "Invalid request", statusCode: 400 });
      }
      const { platform, authToken, email, platformUserId } = body.data;

      const encryptedToken = encryptionService.encrypt(authToken);

      const connection = await fastify.prisma.platformConnection.upsert({
        where: { userId_platform: { userId: req.user.sub, platform } },
        update: { encryptedToken, platformEmail: email, platformUserId, isActive: true },
        create: {
          userId: req.user.sub,
          platform,
          encryptedToken,
          platformEmail: email,
          platformUserId,
        },
        select: {
          id: true,
          platform: true,
          platformUserId: true,
          platformEmail: true,
          isActive: true,
          connectedAt: true,
        },
      });

      return reply.status(201).send({ data: connection });
    }
  );

  // DELETE /connections/:platform
  fastify.delete<{ Params: { platform: string } }>(
    "/connections/:platform",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const platform = req.params.platform as Platform;
      if (!Object.values(Platform).includes(platform)) {
        return reply.status(400).send({ error: "Invalid platform", statusCode: 400 });
      }

      await fastify.prisma.platformConnection.updateMany({
        where: { userId: req.user.sub, platform },
        data: { isActive: false },
      });

      return reply.send({ data: { message: "Connection deactivated" } });
    }
  );
}
