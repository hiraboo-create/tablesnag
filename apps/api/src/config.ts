import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().length(64, "ENCRYPTION_KEY must be a 64-char hex string (32 bytes)"),
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  RESY_API_KEY: z.string().optional(),
  RESY_AUTH_TOKEN: z.string().optional(),
  OPENTABLE_CLIENT_ID: z.string().optional(),
  OPENTABLE_CLIENT_SECRET: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),
  SENDGRID_FROM_EMAIL: z.string().email().default("noreply@tablesnag.com"),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  API_URL: z.string().url().default("http://localhost:3001"),
  NEXT_PUBLIC_API_URL: z.string().url().optional(),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment variables:");
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
export type Config = typeof config;
