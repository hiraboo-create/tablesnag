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

      // Use Cloudflare Worker proxy if configured (avoids datacenter IP blocks)
      let res: Response;
      if (config.RESY_PROXY_URL && config.RESY_PROXY_SECRET) {
        res = await fetch(config.RESY_PROXY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Proxy-Secret": config.RESY_PROXY_SECRET,
          },
          body: JSON.stringify({ email: body.data.email, password: body.data.password }),
        });
      } else {
        res = await fetch("https://api.resy.com/3/auth/password", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `ResyAPI api_key="${config.RESY_API_KEY}"`,
            Origin: "https://resy.com",
            Referer: "https://resy.com/",
          },
          body: new URLSearchParams({ email: body.data.email, password: body.data.password }),
        });
      }

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

  // POST /connections/resy/sync-payment — fetch payment methods from Resy and store the default
  fastify.post(
    "/connections/resy/sync-payment",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const connection = await fastify.prisma.platformConnection.findFirst({
        where: { userId: req.user.sub, platform: Platform.RESY, isActive: true },
      });
      if (!connection) {
        return reply.status(404).send({ error: "No active Resy connection found", statusCode: 404 });
      }

      if (!config.RESY_PROXY_URL || !config.RESY_PROXY_SECRET) {
        return reply.status(503).send({ error: "Resy proxy not configured", statusCode: 503 });
      }

      const authToken = encryptionService.decrypt(connection.encryptedToken);
      const res = await fetch(`${config.RESY_PROXY_URL}/resy/user`, {
        headers: {
          "X-Proxy-Secret": config.RESY_PROXY_SECRET,
          "X-Resy-Auth-Token": authToken,
        },
      });

      if (!res.ok) {
        return reply.status(502).send({ error: `Resy API error: ${res.status}`, statusCode: 502 });
      }

      const data = await res.json() as Record<string, unknown>;
      const paymentMethods = (data.payment_methods as Array<{ id: number; is_default?: boolean }>) ?? [];

      if (paymentMethods.length === 0) {
        return reply.send({
          data: {
            synced: false,
            message: "No payment methods found on your Resy account. Please add a card at resy.com first.",
          },
        });
      }

      // Prefer the default payment method, otherwise use the first
      const defaultPm = paymentMethods.find((p) => p.is_default) ?? paymentMethods[0];
      const resyPaymentMethodId = String(defaultPm.id);

      await fastify.prisma.platformConnection.update({
        where: { id: connection.id },
        data: { resyPaymentMethodId },
      });

      return reply.send({
        data: {
          synced: true,
          resyPaymentMethodId,
          totalMethods: paymentMethods.length,
        },
      });
    }
  );

  // GET /connections/resy/payment-methods — list payment methods from Resy profile
  fastify.get(
    "/connections/resy/payment-methods",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const connection = await fastify.prisma.platformConnection.findFirst({
        where: { userId: req.user.sub, platform: Platform.RESY, isActive: true },
      });
      if (!connection) {
        return reply.status(404).send({ error: "No active Resy connection", statusCode: 404 });
      }

      if (!config.RESY_PROXY_URL || !config.RESY_PROXY_SECRET) {
        return reply.status(503).send({ error: "Resy proxy not configured", statusCode: 503 });
      }

      const authToken = encryptionService.decrypt(connection.encryptedToken);
      const res = await fetch(`${config.RESY_PROXY_URL}/resy/user`, {
        headers: {
          "X-Proxy-Secret": config.RESY_PROXY_SECRET,
          "X-Resy-Auth-Token": authToken,
        },
      });

      if (!res.ok) {
        return reply.status(502).send({ error: `Resy API error: ${res.status}`, statusCode: 502 });
      }

      const data = await res.json() as Record<string, unknown>;
      const paymentMethods = (data.payment_methods as unknown[]) ?? [];

      return reply.send({
        data: {
          paymentMethods,
          storedResyPaymentMethodId: connection.resyPaymentMethodId,
        },
      });
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
