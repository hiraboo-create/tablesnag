import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { encryptionService } from "../services/encryption.service";
import { Platform } from "@tablesnag/shared";
import { config } from "../config";

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

  // POST /connections/resy/login — exchange Resy email+password for auth token
  fastify.post(
    "/connections/resy/login",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const body = z.object({
        email: z.string().email(),
        password: z.string().min(1),
      }).safeParse(req.body);
      if (!body.success) {
        return reply.status(400).send({ error: "Email and password required", statusCode: 400 });
      }

      const res = await fetch("https://api.resy.com/3/auth/password", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `ResyAPI api_key="${config.RESY_API_KEY}"`,
          Origin: "https://resy.com",
          Referer: "https://resy.com/",
        },
        body: new URLSearchParams({ email: body.data.email, password: body.data.password }),
      });

      const resyBody = await res.text();
      fastify.log.warn({ resyStatus: res.status, resyBody }, "Resy auth response");

      if (res.status === 419 || res.status === 401 || res.status === 422) {
        return reply.status(401).send({ error: "Invalid Resy email or password", statusCode: 401 });
      }
      if (!res.ok) {
        return reply.status(502).send({ error: `Resy login failed (status ${res.status})`, statusCode: 502 });
      }

      const data = JSON.parse(resyBody);
      const token: string = data.token;
      const platformUserId = String(data.id ?? "");

      const encryptedToken = encryptionService.encrypt(token);
      const connection = await fastify.prisma.platformConnection.upsert({
        where: { userId_platform: { userId: req.user.sub, platform: Platform.RESY } },
        update: { encryptedToken, platformEmail: body.data.email, platformUserId, isActive: true },
        create: {
          userId: req.user.sub,
          platform: Platform.RESY,
          encryptedToken,
          platformEmail: body.data.email,
          platformUserId,
        },
        select: { id: true, platform: true, platformUserId: true, platformEmail: true, isActive: true, connectedAt: true },
      });

      return reply.status(201).send({ data: connection });
    }
  );

  // POST /connections/opentable/login — exchange OpenTable email+password for auth token
  fastify.post(
    "/connections/opentable/login",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const body = z.object({
        email: z.string().email(),
        password: z.string().min(1),
      }).safeParse(req.body);
      if (!body.success) {
        return reply.status(400).send({ error: "Email and password required", statusCode: 400 });
      }

      const res = await fetch("https://www.opentable.com/api/auth/user/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (compatible)",
          Origin: "https://www.opentable.com",
          Referer: "https://www.opentable.com/",
        },
        body: JSON.stringify({ email: body.data.email, password: body.data.password, rememberMe: true }),
      });

      if (res.status === 401 || res.status === 422 || res.status === 403) {
        return reply.status(401).send({ error: "Invalid OpenTable email or password", statusCode: 401 });
      }
      if (!res.ok) {
        return reply.status(502).send({ error: "OpenTable login failed", statusCode: 502 });
      }

      const data = await res.json();
      // OpenTable returns token in different fields depending on API version
      const token: string = data.token ?? data.access_token ?? data.authToken ?? "";
      if (!token) {
        return reply.status(502).send({ error: "OpenTable did not return a token", statusCode: 502 });
      }

      const platformUserId = String(data.id ?? data.userId ?? data.user?.id ?? "");
      const encryptedToken = encryptionService.encrypt(token);

      const connection = await fastify.prisma.platformConnection.upsert({
        where: { userId_platform: { userId: req.user.sub, platform: Platform.OPENTABLE } },
        update: { encryptedToken, platformEmail: body.data.email, platformUserId, isActive: true },
        create: {
          userId: req.user.sub,
          platform: Platform.OPENTABLE,
          encryptedToken,
          platformEmail: body.data.email,
          platformUserId,
        },
        select: { id: true, platform: true, platformUserId: true, platformEmail: true, isActive: true, connectedAt: true },
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
