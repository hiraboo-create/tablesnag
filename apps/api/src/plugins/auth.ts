import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";
import { config } from "../config";
import type { FastifyRequest, FastifyReply } from "fastify";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; email: string; type: "access" | "refresh" };
    user: { sub: string; email: string; type: "access" | "refresh" };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(async (fastify) => {
  fastify.register(fastifyJwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: "7d" },
  });

  fastify.decorate(
    "authenticate",
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        await req.jwtVerify();
        if (req.user.type !== "access") {
          return reply.status(401).send({ error: "Invalid token type", statusCode: 401 });
        }
      } catch (err) {
        return reply.status(401).send({ error: "Unauthorized", statusCode: 401 });
      }
    }
  );
});
