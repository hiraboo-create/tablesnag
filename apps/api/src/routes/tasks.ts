import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Platform } from "@tablesnag/shared";
import { getBookingQueue } from "../worker/queue";
import { scheduleTask, removeTaskSchedule } from "../worker/scheduler";
import { venueLookupService } from "../services/venue-lookup.service";
import { ResyService } from "../services/resy.service";
import { encryptionService } from "../services/encryption.service";
import { emailService } from "../services/email.service";

const createTaskSchema = z.object({
  restaurantId: z.string().min(1),
  restaurantName: z.string().min(1),
  restaurantAddress: z.string().optional(),
  restaurantLat: z.number().optional(),
  restaurantLon: z.number().optional(),
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
  const queue = getBookingQueue();

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

      const { restaurantLat, restaurantLon, ...taskRest } = rest;

      const task = await fastify.prisma.bookingTask.create({
        data: {
          userId: req.user.sub,
          dateRangeStart: start,
          dateRangeEnd: end,
          restaurantLat: restaurantLat ?? null,
          restaurantLon: restaurantLon ?? null,
          ...taskRest,
        },
      });

      // Resolve platform-specific venue IDs synchronously before responding
      // (fast — single CF Worker hop; falls back gracefully if lookup fails)
      let finalTask = task;
      if (restaurantLat && restaurantLon) {
        try {
          const venueIds = await venueLookupService.lookupAll(
            task.platforms as string[],
            task.restaurantName,
            restaurantLat,
            restaurantLon
          );
          if (Object.keys(venueIds).length > 0) {
            finalTask = await fastify.prisma.bookingTask.update({
              where: { id: task.id },
              data: { platformVenueIds: venueIds as Record<string, string> },
            });
          }
        } catch (err) {
          fastify.log.warn(`Venue ID lookup failed for task ${task.id}: ${String(err)}`);
        }
      }

      // Schedule BullMQ jobs
      await scheduleTask(queue, finalTask.id, req.user.sub);

      return reply.status(201).send({ data: finalTask });
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

  // POST /tasks/:id/trigger — immediately attempt booking (for serverless environments
  // where the BullMQ worker is not running persistently)
  fastify.post<{ Params: { id: string } }>(
    "/tasks/:id/trigger",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const task = await fastify.prisma.bookingTask.findFirst({
        where: { id: req.params.id, userId: req.user.sub },
        include: { paymentMethod: true },
      });
      if (!task) return reply.status(404).send({ error: "Task not found", statusCode: 404 });
      if (task.status !== "MONITORING") {
        return reply.status(400).send({ error: `Task is ${task.status}, not MONITORING`, statusCode: 400 });
      }

      const user = await fastify.prisma.user.findUnique({ where: { id: req.user.sub } });
      if (!user) return reply.status(404).send({ error: "User not found", statusCode: 404 });

      const connections = await fastify.prisma.platformConnection.findMany({
        where: { userId: req.user.sub, platform: { in: task.platforms as Platform[] }, isActive: true },
        select: {
          id: true,
          platform: true,
          encryptedToken: true,
          resyPaymentMethodId: true,
        },
      });
      if (!connections.length) {
        return reply.status(400).send({ error: "No active platform connections for this task", statusCode: 400 });
      }

      const venueIds = task.platformVenueIds as Record<string, string> | null;
      const now = new Date();

      for (const connection of connections) {
        if (connection.platform !== "RESY") continue;

        const decryptedToken = encryptionService.decrypt(connection.encryptedToken);
        const resyService = new ResyService(decryptedToken);
        const platformVenueId = venueIds?.["RESY"] ?? task.restaurantId;
        // Use Resy-native payment method ID (numeric) stored after syncing from Resy profile
        const resyPaymentMethodId = connection.resyPaymentMethodId ?? undefined;

        const startDate = new Date(Math.max(new Date(task.dateRangeStart).getTime(), now.getTime()));
        const endDate = new Date(task.dateRangeEnd);

        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().slice(0, 10);
          try {
            const slots = await resyService.getAvailability({
              restaurantId: task.restaurantId,
              platformVenueId,
              date: dateStr,
              partySize: task.partySize,
              startTime: task.timeWindowStart,
              endTime: task.timeWindowEnd,
              lat: task.restaurantLat ?? undefined,
              lon: task.restaurantLon ?? undefined,
            });

            if (!slots.length) continue;

            const result = await resyService.bookSlot(slots[0], resyPaymentMethodId);

            if (result.success) {
              const reservation = await fastify.prisma.reservation.create({
                data: {
                  userId: task.userId,
                  taskId: task.id,
                  platform: "RESY",
                  restaurantName: task.restaurantName,
                  confirmationNumber: result.confirmationNumber,
                  platformReservationId: result.reservationId,
                  partySize: slots[0].partySize,
                  date: new Date(`${slots[0].date}T${slots[0].time}:00`),
                  time: slots[0].time,
                  status: "CONFIRMED",
                  slotData: JSON.parse(JSON.stringify(slots[0])),
                },
              });
              await fastify.prisma.bookingTask.update({
                where: { id: task.id },
                data: { status: "BOOKED" },
              });
              await emailService.sendBookingConfirmation(user.email, {
                restaurantName: task.restaurantName,
                date: slots[0].date,
                time: slots[0].time,
                partySize: slots[0].partySize,
                platform: "RESY",
                confirmationNumber: result.confirmationNumber,
              });
              return reply.send({
                data: {
                  booked: true,
                  reservation,
                  slot: slots[0],
                  confirmationNumber: result.confirmationNumber,
                },
              });
            }

            return reply.send({
              data: { booked: false, reason: result.error, errorCode: result.errorCode },
            });
          } catch (err) {
            fastify.log.error(`Trigger booking error for ${dateStr}: ${String(err)}`);
          }
        }
      }

      return reply.send({ data: { booked: false, reason: "No available slots found in date range" } });
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
