import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { GooglePlacesService } from "../services/google-places.service";

const searchSchema = z.object({
  query: z.string().min(1).max(200),
  sessionToken: z.string().optional(),
});

export async function restaurantRoutes(fastify: FastifyInstance): Promise<void> {
  const placesService = new GooglePlacesService(fastify.redis);

  // GET /restaurants/search?query=...&sessionToken=...
  fastify.get<{ Querystring: { query: string; sessionToken?: string } }>(
    "/restaurants/search",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const parsed = searchSchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid request", statusCode: 400 });
      }
      const { query, sessionToken } = parsed.data;
      const token = sessionToken ?? crypto.randomUUID();

      const results = await placesService.autocomplete(query, token);
      return reply.send({ data: results });
    }
  );

  // GET /restaurants/:placeId
  fastify.get<{ Params: { placeId: string } }>(
    "/restaurants/:placeId",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const details = await placesService.getPlaceDetails(req.params.placeId);
      if (!details) {
        return reply.status(404).send({ error: "Place not found", statusCode: 404 });
      }
      return reply.send({ data: details });
    }
  );
}
