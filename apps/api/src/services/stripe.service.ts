import Stripe from "stripe";
import { config } from "../config";

export class StripeService {
  private stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(config.STRIPE_SECRET_KEY ?? "", {
      apiVersion: "2024-04-10",
    });
  }

  async getOrCreateCustomer(userId: string, email: string): Promise<string> {
    const existing = await this.stripe.customers.search({
      query: `metadata["userId"]:"${userId}"`,
      limit: 1,
    });

    if (existing.data.length > 0) {
      return existing.data[0].id;
    }

    const customer = await this.stripe.customers.create({
      email,
      metadata: { userId },
    });
    return customer.id;
  }

  async attachPaymentMethod(
    customerId: string,
    paymentMethodId: string
  ): Promise<Stripe.PaymentMethod> {
    await this.stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    const pm = await this.stripe.paymentMethods.retrieve(paymentMethodId);
    return pm;
  }

  async listPaymentMethods(customerId: string): Promise<Stripe.PaymentMethod[]> {
    const result = await this.stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
    });
    return result.data;
  }

  async detachPaymentMethod(paymentMethodId: string): Promise<void> {
    await this.stripe.paymentMethods.detach(paymentMethodId);
  }

  async setDefaultPaymentMethod(
    customerId: string,
    paymentMethodId: string
  ): Promise<void> {
    await this.stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
  }

  constructWebhookEvent(payload: string | Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      config.STRIPE_WEBHOOK_SECRET ?? ""
    );
  }
}

export const stripeService = new StripeService();
