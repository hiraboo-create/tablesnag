import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { stripeService } from "../services/stripe.service";
import { encryptionService } from "../services/encryption.service";
import { config } from "../config";
import { Platform } from "@tablesnag/shared";

const addPaymentSchema = z.object({
  paymentMethodId: z.string().min(1),
  resyStripePaymentMethodId: z.string().optional(), // Stripe PM ID on Resy's account
});

export async function paymentMethodRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /payment-methods
  fastify.get(
    "/payment-methods",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const methods = await fastify.prisma.paymentMethod.findMany({
        where: { userId: req.user.sub },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      });
      return reply.send({ data: methods });
    }
  );

  // POST /payment-methods
  fastify.post(
    "/payment-methods",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const body = addPaymentSchema.safeParse(req.body);
      if (!body.success) {
        return reply.status(400).send({ error: "Invalid request", statusCode: 400 });
      }

      const user = await fastify.prisma.user.findUnique({
        where: { id: req.user.sub },
        select: { email: true },
      });
      if (!user) return reply.status(404).send({ error: "User not found", statusCode: 404 });

      const stripeCustomerId = await stripeService.getOrCreateCustomer(req.user.sub, user.email);
      const stripePm = await stripeService.attachPaymentMethod(
        stripeCustomerId,
        body.data.paymentMethodId
      );

      const card = stripePm.card;
      if (!card) {
        return reply.status(400).send({ error: "Not a card payment method", statusCode: 400 });
      }

      const isFirstMethod = (await fastify.prisma.paymentMethod.count({
        where: { userId: req.user.sub },
      })) === 0;

      const pm = await fastify.prisma.paymentMethod.create({
        data: {
          userId: req.user.sub,
          stripeCustomerId,
          stripePaymentMethodId: stripePm.id,
          brand: card.brand,
          last4: card.last4,
          expMonth: card.exp_month,
          expYear: card.exp_year,
          isDefault: isFirstMethod,
        },
      });

      if (isFirstMethod) {
        await stripeService.setDefaultPaymentMethod(stripeCustomerId, stripePm.id);
      }

      // ── Register card on Resy's Stripe account if PM provided ────
      if (body.data.resyStripePaymentMethodId && config.RESY_PROXY_URL && config.RESY_PROXY_SECRET) {
        try {
          const resyConn = await fastify.prisma.platformConnection.findFirst({
            where: { userId: req.user.sub, platform: Platform.RESY, isActive: true },
          });
          if (resyConn) {
            const authToken = encryptionService.decrypt(resyConn.encryptedToken);
            const resyRes = await fetch(`${config.RESY_PROXY_URL}/resy/stripe-payment-method`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Proxy-Secret": config.RESY_PROXY_SECRET,
                "X-Resy-Auth-Token": authToken,
              },
              body: JSON.stringify({ payment_method_id: body.data.resyStripePaymentMethodId }),
            });
            if (resyRes.ok) {
              const resyData = await resyRes.json() as Record<string, unknown>;
              // Resy returns the internal payment method ID
              const resyPaymentMethodId =
                String(resyData.id ?? resyData.payment_method_id ?? "");
              if (resyPaymentMethodId) {
                await fastify.prisma.platformConnection.update({
                  where: { id: resyConn.id },
                  data: { resyPaymentMethodId },
                });
              }
            } else {
              fastify.log.warn(`Resy payment method registration failed: ${resyRes.status} ${await resyRes.text()}`);
            }
          }
        } catch (err) {
          fastify.log.warn(`Could not register card on Resy: ${String(err)}`);
        }
      }

      return reply.status(201).send({ data: pm });
    }
  );

  // DELETE /payment-methods/:id
  fastify.delete<{ Params: { id: string } }>(
    "/payment-methods/:id",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const pm = await fastify.prisma.paymentMethod.findFirst({
        where: { id: req.params.id, userId: req.user.sub },
      });
      if (!pm) return reply.status(404).send({ error: "Payment method not found", statusCode: 404 });

      await stripeService.detachPaymentMethod(pm.stripePaymentMethodId);
      await fastify.prisma.paymentMethod.delete({ where: { id: pm.id } });

      // If deleted method was default, promote another
      if (pm.isDefault) {
        const next = await fastify.prisma.paymentMethod.findFirst({
          where: { userId: req.user.sub },
          orderBy: { createdAt: "asc" },
        });
        if (next) {
          await fastify.prisma.paymentMethod.update({
            where: { id: next.id },
            data: { isDefault: true },
          });
        }
      }

      return reply.send({ data: { message: "Payment method removed" } });
    }
  );

  // PATCH /payment-methods/:id/default
  fastify.patch<{ Params: { id: string } }>(
    "/payment-methods/:id/default",
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const pm = await fastify.prisma.paymentMethod.findFirst({
        where: { id: req.params.id, userId: req.user.sub },
      });
      if (!pm) return reply.status(404).send({ error: "Payment method not found", statusCode: 404 });

      await fastify.prisma.$transaction([
        fastify.prisma.paymentMethod.updateMany({
          where: { userId: req.user.sub },
          data: { isDefault: false },
        }),
        fastify.prisma.paymentMethod.update({
          where: { id: pm.id },
          data: { isDefault: true },
        }),
      ]);

      await stripeService.setDefaultPaymentMethod(pm.stripeCustomerId, pm.stripePaymentMethodId);

      return reply.send({ data: { message: "Default updated" } });
    }
  );
}
