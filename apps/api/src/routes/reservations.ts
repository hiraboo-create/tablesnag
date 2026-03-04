import type { FastifyInstance } from "fastify";

export async function reservationRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /reservations
  fastify.get<{ Querystring: { page?: string; pageSize?: string } }>(
    "/reservations",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const page = parseInt(req.query.page ?? "1", 10);
      const pageSize = Math.min(parseInt(req.query.pageSize ?? "20", 10), 100);
      const skip = (page - 1) * pageSize;

      const [reservations, total] = await Promise.all([
        fastify.prisma.reservation.findMany({
          where: { userId: req.user.sub },
          orderBy: { bookedAt: "desc" },
          skip,
          take: pageSize,
        }),
        fastify.prisma.reservation.count({ where: { userId: req.user.sub } }),
      ]);

      return reply.send({ data: reservations, total, page, pageSize });
    }
  );

  // GET /reservations/:id
  fastify.get<{ Params: { id: string } }>(
    "/reservations/:id",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const reservation = await fastify.prisma.reservation.findFirst({
        where: { id: req.params.id, userId: req.user.sub },
      });
      if (!reservation) {
        return reply.status(404).send({ error: "Reservation not found", statusCode: 404 });
      }
      return reply.send({ data: reservation });
    }
  );
}
