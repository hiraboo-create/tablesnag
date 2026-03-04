import bcrypt from "bcrypt";
import crypto from "crypto";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { config } from "../config";

const SALT_ROUNDS = 12;

export class AuthService {
  constructor(
    private fastify: FastifyInstance,
    private prisma: PrismaClient
  ) {}

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  signAccessToken(payload: { sub: string; email: string }): string {
    return this.fastify.jwt.sign({ ...payload, type: "access" }, { expiresIn: "15m" });
  }

  signRefreshToken(payload: { sub: string; email: string }): string {
    // Use refresh secret by signing separately
    const jwt = require("@fastify/jwt");
    // We sign with a custom secret for refresh tokens
    const token = require("jsonwebtoken").sign(
      { sub: payload.sub, email: payload.email, type: "refresh" },
      config.JWT_REFRESH_SECRET,
      { expiresIn: "7d" }
    );
    return token;
  }

  verifyRefreshToken(token: string): { sub: string; email: string } | null {
    try {
      const payload = require("jsonwebtoken").verify(token, config.JWT_REFRESH_SECRET) as {
        sub: string;
        email: string;
        type: string;
      };
      if (payload.type !== "refresh") return null;
      return { sub: payload.sub, email: payload.email };
    } catch {
      return null;
    }
  }

  generateVerifyToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  generateResetToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  async saveRefreshToken(userId: string, token: string): Promise<void> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await this.prisma.refreshToken.create({
      data: { userId, token, expiresAt },
    });
  }

  async invalidateRefreshToken(token: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { token } });
  }

  async isRefreshTokenValid(token: string): Promise<boolean> {
    const stored = await this.prisma.refreshToken.findUnique({ where: { token } });
    if (!stored) return false;
    if (stored.expiresAt < new Date()) {
      await this.prisma.refreshToken.delete({ where: { token } });
      return false;
    }
    return true;
  }
}
