import type { IncomingMessage, ServerResponse } from "http";
import { buildApp } from "../src/app";
import type { FastifyInstance } from "fastify";

// Reuse the app instance across warm invocations
let app: FastifyInstance | null = null;

async function getApp(): Promise<FastifyInstance> {
  if (!app) {
    app = await buildApp();
    await app.ready();
  }
  return app;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const instance = await getApp();
  instance.server.emit("request", req, res);
}
