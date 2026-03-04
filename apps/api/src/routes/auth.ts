import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AuthService } from "../services/auth.service";
import { emailService } from "../services/email.service";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

const forgotSchema = z.object({
  email: z.string().email(),
});

const resetSchema = z.object({
  token: z.string(),
  password: z.string().min(8),
});

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const authService = new AuthService(fastify, fastify.prisma);

  // POST /auth/register
  fastify.post("/auth/register", async (req, reply) => {
    const body = registerSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Invalid request", statusCode: 400 });
    }
    const { email, password, name } = body.data;

    const existing = await fastify.prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.status(409).send({ error: "Email already registered", statusCode: 409 });
    }

    const passwordHash = await authService.hashPassword(password);
    const verifyToken = authService.generateVerifyToken();

    const user = await fastify.prisma.user.create({
      data: { email, passwordHash, name, verifyToken },
    });

    await emailService.sendVerificationEmail(email, verifyToken, name);

    const accessToken = authService.signAccessToken({ sub: user.id, email: user.email });
    const refreshToken = authService.signRefreshToken({ sub: user.id, email: user.email });
    await authService.saveRefreshToken(user.id, refreshToken);

    return reply.status(201).send({
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
    });
  });

  // POST /auth/login
  fastify.post("/auth/login", async (req, reply) => {
    const body = loginSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Invalid request", statusCode: 400 });
    }
    const { email, password } = body.data;

    const user = await fastify.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.status(401).send({ error: "Invalid credentials", statusCode: 401 });
    }

    const valid = await authService.verifyPassword(password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: "Invalid credentials", statusCode: 401 });
    }

    const accessToken = authService.signAccessToken({ sub: user.id, email: user.email });
    const refreshToken = authService.signRefreshToken({ sub: user.id, email: user.email });
    await authService.saveRefreshToken(user.id, refreshToken);

    return reply.send({
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
    });
  });

  // POST /auth/refresh
  fastify.post("/auth/refresh", async (req, reply) => {
    const body = refreshSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Invalid request", statusCode: 400 });
    }

    const payload = authService.verifyRefreshToken(body.data.refreshToken);
    if (!payload) {
      return reply.status(401).send({ error: "Invalid refresh token", statusCode: 401 });
    }

    const isValid = await authService.isRefreshTokenValid(body.data.refreshToken);
    if (!isValid) {
      return reply.status(401).send({ error: "Refresh token expired", statusCode: 401 });
    }

    await authService.invalidateRefreshToken(body.data.refreshToken);

    const accessToken = authService.signAccessToken({ sub: payload.sub, email: payload.email });
    const newRefreshToken = authService.signRefreshToken({ sub: payload.sub, email: payload.email });
    await authService.saveRefreshToken(payload.sub, newRefreshToken);

    return reply.send({ data: { accessToken, refreshToken: newRefreshToken } });
  });

  // POST /auth/logout
  fastify.post("/auth/logout", { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const body = refreshSchema.safeParse(req.body);
    if (body.success) {
      await authService.invalidateRefreshToken(body.data.refreshToken);
    }
    return reply.send({ data: { message: "Logged out" } });
  });

  // GET /auth/verify-email
  fastify.get<{ Querystring: { token: string } }>("/auth/verify-email", async (req, reply) => {
    const { token } = req.query;
    const user = await fastify.prisma.user.findUnique({ where: { verifyToken: token } });
    if (!user) {
      return reply.status(400).send({ error: "Invalid or expired token", statusCode: 400 });
    }
    await fastify.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verifyToken: null },
    });
    return reply.send({ data: { message: "Email verified" } });
  });

  // POST /auth/forgot-password
  fastify.post("/auth/forgot-password", async (req, reply) => {
    const body = forgotSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Invalid request", statusCode: 400 });
    }
    const user = await fastify.prisma.user.findUnique({ where: { email: body.data.email } });
    if (user) {
      const resetToken = authService.generateResetToken();
      const resetTokenExp = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await fastify.prisma.user.update({
        where: { id: user.id },
        data: { resetToken, resetTokenExp },
      });
      await emailService.sendPasswordResetEmail(user.email, resetToken);
    }
    // Always return success to prevent email enumeration
    return reply.send({ data: { message: "If an account exists, a reset email was sent" } });
  });

  // POST /auth/reset-password
  fastify.post("/auth/reset-password", async (req, reply) => {
    const body = resetSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Invalid request", statusCode: 400 });
    }
    const user = await fastify.prisma.user.findUnique({
      where: { resetToken: body.data.token },
    });
    if (!user || !user.resetTokenExp || user.resetTokenExp < new Date()) {
      return reply.status(400).send({ error: "Invalid or expired token", statusCode: 400 });
    }
    const passwordHash = await authService.hashPassword(body.data.password);
    await fastify.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetToken: null, resetTokenExp: null },
    });
    return reply.send({ data: { message: "Password reset successfully" } });
  });

  // GET /auth/me
  fastify.get("/auth/me", { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const user = await fastify.prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { id: true, email: true, name: true, emailVerified: true, createdAt: true, updatedAt: true },
    });
    if (!user) return reply.status(404).send({ error: "User not found", statusCode: 404 });
    return reply.send({ data: user });
  });
}
