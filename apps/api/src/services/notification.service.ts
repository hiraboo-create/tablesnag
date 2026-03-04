import { config } from "../config";

let messaging: import("firebase-admin/messaging").Messaging | null = null;

if (config.FIREBASE_PROJECT_ID && config.FIREBASE_CLIENT_EMAIL && config.FIREBASE_PRIVATE_KEY) {
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.FIREBASE_PROJECT_ID,
        clientEmail: config.FIREBASE_CLIENT_EMAIL,
        privateKey: config.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
  }
  messaging = admin.messaging();
}

export class NotificationService {
  async sendPushNotification(
    fcmToken: string,
    title: string,
    body: string,
    data?: Record<string, string>
  ): Promise<void> {
    if (!messaging) {
      console.log(`[NotificationService] FCM not configured. Would push: ${title}`);
      return;
    }
    await messaging.send({
      token: fcmToken,
      notification: { title, body },
      data,
      webpush: {
        notification: { title, body, icon: "/icon-192.png" },
      },
    });
  }

  async sendBookingConfirmationPush(
    fcmToken: string,
    restaurantName: string,
    date: string,
    time: string
  ): Promise<void> {
    await this.sendPushNotification(
      fcmToken,
      "Reservation Confirmed!",
      `Your table at ${restaurantName} is booked for ${date} at ${time}.`,
      { type: "booking_confirmed", restaurantName, date, time }
    );
  }
}

export const notificationService = new NotificationService();
