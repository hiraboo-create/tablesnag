import type { Job } from "bullmq";
import type { PrismaClient } from "@prisma/client";
import type Redis from "ioredis";
import { Platform, TaskStatus } from "@tablesnag/shared";
import type { BookingJobData } from "./queue";
import { ResyService } from "../services/resy.service";
import { OpenTableService } from "../services/opentable.service";
import { encryptionService } from "../services/encryption.service";
import { emailService } from "../services/email.service";
import { config } from "../config";

const LOCK_TTL_MS = 60_000; // 1 minute

export async function processBookingJob(
  job: Job<BookingJobData>,
  prisma: PrismaClient,
  redis: Redis
): Promise<void> {
  const { taskId, userId } = job.data;

  // Distributed lock to prevent double-booking
  const lockKey = `lock:task:${taskId}`;
  const lockValue = `${Date.now()}-${Math.random()}`;
  const acquired = await redis.set(lockKey, lockValue, "PX", LOCK_TTL_MS, "NX");
  if (!acquired) {
    job.log(`Task ${taskId} already being processed, skipping`);
    return;
  }

  try {
    const task = await prisma.bookingTask.findUnique({
      where: { id: taskId },
      include: { paymentMethod: true },
    });

    if (!task || task.status !== "MONITORING") {
      return;
    }

    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // Check if task date range is still valid
    if (new Date(task.dateRangeEnd) < now) {
      await prisma.bookingTask.update({
        where: { id: taskId },
        data: { status: "FAILED" },
      });
      return;
    }

    // Get user info
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    // Get platform connections
    const connections = await prisma.platformConnection.findMany({
      where: { userId, platform: { in: task.platforms as Platform[] }, isActive: true },
    });

    // Update last checked timestamp
    await prisma.bookingTask.update({
      where: { id: taskId },
      data: { lastCheckedAt: now },
    });

    // Try each platform
    for (const connection of connections) {
      const decryptedToken = encryptionService.decrypt(connection.encryptedToken);

      // Build date range to check
      const startDate = new Date(Math.max(new Date(task.dateRangeStart).getTime(), now.getTime()));
      const endDate = new Date(task.dateRangeEnd);

      let found = false;

      // Use platform-specific venue ID; fall back to restaurantId if not resolved yet
      const venueIds = task.platformVenueIds as Record<string, string> | null;
      const platformVenueId =
        venueIds?.[connection.platform] ?? task.restaurantId;

      for (let d = new Date(startDate); d <= endDate && !found; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().slice(0, 10);
        const availReq = {
          restaurantId: task.restaurantId,
          platformVenueId,
          date: dateStr,
          partySize: task.partySize,
          startTime: task.timeWindowStart,
          endTime: task.timeWindowEnd,
          lat: task.restaurantLat ?? undefined,
          lon: task.restaurantLon ?? undefined,
        };

        try {
          let slots;

          if (connection.platform === "RESY") {
            const resyService = new ResyService(decryptedToken);
            slots = await resyService.getAvailability(availReq);

            if (slots.length > 0) {
              const slot = slots[0];
              const result = await resyService.bookSlot(
                slot,
                task.paymentMethod?.stripePaymentMethodId
              );

              if (result.success) {
                await handleSuccessfulBooking(
                  prisma,
                  task,
                  user,
                  "RESY",
                  result.reservationId,
                  result.confirmationNumber,
                  slot
                );
                found = true;
              }
            }
          } else if (connection.platform === "OPENTABLE") {
            const otService = new OpenTableService(
              config.OPENTABLE_CLIENT_ID ?? "",
              config.OPENTABLE_CLIENT_SECRET ?? ""
            );
            slots = await otService.getAvailability(availReq);

            if (slots.length > 0) {
              const slot = slots[0];
              const result = await otService.bookSlot(
                slot,
                userId,
                user.email,
                user.name ?? user.email,
                task.paymentMethod?.stripePaymentMethodId
              );

              if (result.success) {
                await handleSuccessfulBooking(
                  prisma,
                  task,
                  user,
                  "OPENTABLE",
                  result.reservationId,
                  result.confirmationNumber,
                  slot
                );
                found = true;
              }
            }
          }
        } catch (err) {
          job.log(`Error checking ${connection.platform} for date ${dateStr}: ${String(err)}`);
        }
      }

      if (found) break;
    }
  } finally {
    // Release lock only if we still hold it
    const current = await redis.get(lockKey);
    if (current === lockValue) {
      await redis.del(lockKey);
    }
  }
}

async function handleSuccessfulBooking(
  prisma: PrismaClient,
  task: { id: string; userId: string; restaurantName: string },
  user: { id: string; email: string; name: string | null },
  platform: string,
  reservationId?: string,
  confirmationNumber?: string,
  slot?: { date: string; time: string; partySize: number }
): Promise<void> {
  if (!slot) return;

  // Create reservation record
  await prisma.reservation.create({
    data: {
      userId: task.userId,
      taskId: task.id,
      platform: platform as Platform,
      restaurantName: task.restaurantName,
      confirmationNumber,
      platformReservationId: reservationId,
      partySize: slot.partySize,
      date: new Date(`${slot.date}T${slot.time}:00`),
      time: slot.time,
      status: "CONFIRMED",
      slotData: slot as unknown as Record<string, unknown>,
    },
  });

  // Mark task as booked
  await prisma.bookingTask.update({
    where: { id: task.id },
    data: { status: "BOOKED" },
  });

  // Send confirmation email
  await emailService.sendBookingConfirmation(user.email, {
    restaurantName: task.restaurantName,
    date: slot.date,
    time: slot.time,
    partySize: slot.partySize,
    platform,
    confirmationNumber,
  });
}
