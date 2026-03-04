import type { Platform } from "./platform";

export interface User {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformConnection {
  id: string;
  userId: string;
  platform: Platform;
  platformUserId: string | null;
  platformEmail: string | null;
  isActive: boolean;
  connectedAt: string;
}

export interface PaymentMethod {
  id: string;
  userId: string;
  stripeCustomerId: string;
  stripePaymentMethodId: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
  createdAt: string;
}
