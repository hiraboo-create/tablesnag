import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Platform } from "@tablesnag/shared";
import { getBookingQueue } from "../worker/queue";
import { scheduleTask, removeTaskSchedule } from "../worker/scheduler";

const createTaskSchema = z.object({
  restaurantId: z.string().min(1),
  restaurantName: z.string().min(1),
  restaurantAddress: z.string().optional(),
  platforms: z.array(z.nativeEnum(Platform)).min(1),
  partySize: z.number().int().min(1).max(12),
  dateRangeStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateRangeEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeWindowStart: z.string().regex(/^\d{2}:\d{2}$/),
  timeWindowEnd: z.string().regex(/^\d{2}:\d{2}$/),
  paymentMethodId: z.string().optional(),
});

const updateTaskSchema = z.object({
  status: z.enum(["MONITORING", "PAUSED"]).optional(),
  paymentMethodId: z.string().optional(),
  timeWindowStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timeWindowEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

export async function taskRoutes(fastify: FastifyInstance): Promise<void> {
  const queue = getBookingQueue(fastify.redis);

  // GET /tasks
  fastify.get<{ Querystring: { page?: string; pageSize?: string; status?: string } }>(
    "/tasks",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const page = parseInt(req.query.page ?? "1", 10);
      const pageSize = Math.min(parseInt(req.query.pageSize ?? "20", 10), 100);
      const skip = (page - 1) * pageSize;

      const where: Record<string, unknown> = { userId: req.user.sub };
      if (req.query.status) where.status = req.query.status;

      const [tasks, total] = await Promise.all([
        fastify.prisma.bookingTask.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: pageSize,
        }),
        fastify.prisma.bookingTask.count({ where }),
      ]);

      return reply.send({ data: tasks, total, page, pageSize });
    }
  );

  // GET /tasks/:id
  fastify.get<{ Params: { id: string } }>(
    "/tasks/:id",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const task = await fastify.prisma.bookingTask.findFirst({
        where: { id: req.params.id, userId: req.user.sub },
        include: { reservations: true },
      });
      if (!task) return reply.status(404).send({ error: "Task not found", statusCode: 404 });
      return reply.send({ data: task });
    }
  );

  // POST /tasks
  fastify.post(
    "/tasks",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const body = createTaskSchema.safeParse(req.body);
      if (!body.success) {
        return reply.status(400).send({ error: "Invalid request", details: body.error.flatten(), statusCode: 400 });
      }
      const { dateRangeStart, dateRangeEnd, ...rest } = body.data;

      // Validate date range
      const start = new Date(dateRangeStart);
      const end = new Date(dateRangeEnd);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (start < today) {
        return reply.status(400).send({ error: "Start date must be today or future", statusCode: 400 });
      }

      const maxDays = 7;
      const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > maxDays) {
        return reply.status(400).send({ error: `Date range cannot exceed ${maxDays} days`, statusCode: 400 });
      }

      if (end < start) {
        return reply.status(400).send({ error: "End date must be after start date", statusCode: 400 });
      }

      const task = await fastify.prisma.bookingTask.create({
        data: {
          userId: req.user.sub,
          dateRangeStart: start,
          dateRangeEnd: end,
          ...rest,
        },
      });

      // Schedule BullMQ jobs
      await scheduleTask(queue, task.id, req.user.sub);

      return reply.status(201).send({ data: task });
    }
  );

  // PATCH /tasks/:id
  fastify.patch<{ Params: { id: string } }>(
    "/tasks/:id",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const task = await fastify.prisma.bookingTask.findFirst({
        where: { id: req.params.id, userId: req.user.sub },
      });
      if (!task) return reply.status(404).send({ error: "Task not found", statusCode: 404 });

      const body = updateTaskSchema.safeParse(req.body);
      if (!body.success) {
        return reply.status(400).send({ error: "Invalid request", statusCode: 400 });
      }

      const prevStatus = task.status;
      const updated = await fastify.prisma.bookingTask.update({
        where: { id: task.id },
        data: body.data,
      });

      // Manage scheduling based on status change
      if (body.data.status === "PAUSED" && prevStatus === "MONITORING") {
        await removeTaskSchedule(queue, task.id);
      } else if (body.data.status === "MONITORING" && prevStatus === "PAUSED") {
        await scheduleTask(queue, task.id, req.user.sub);
      }

      return reply.send({ data: updated });
    }
  );

  // DELETE /tasks/:id
  fastify.delete<{ Params: { id: string } }>(
    "/tasks/:id",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const task = await fastify.prisma.bookingTask.findFirst({
        where: { id: req.params.id, userId: req.user.sub },
      });
      if (!task) return reply.status(404).send({ error: "Task not found", statusCode: 404 });

      await removeTaskSchedule(queue, task.id);
      await fastify.prisma.bookingTask.update({
        where: { id: task.id },
        data: { status: "CANCELLED" },
      });

      return reply.send({ data: { message: "Task cancelled" } });
    }
  );
}
