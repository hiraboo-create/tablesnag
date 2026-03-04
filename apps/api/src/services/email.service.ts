import sgMail from "@sendgrid/mail";
import { config } from "../config";

if (config.SENDGRID_API_KEY) {
  sgMail.setApiKey(config.SENDGRID_API_KEY);
}

export class EmailService {
  private readonly from = config.SENDGRID_FROM_EMAIL;

  async sendVerificationEmail(to: string, token: string, name?: string): Promise<void> {
    const verifyUrl = `${config.API_URL}/auth/verify-email?token=${token}`;
    await this.send({
      to,
      subject: "Verify your TableSnag email",
      html: `
        <h2>Welcome to TableSnag${name ? `, ${name}` : ""}!</h2>
        <p>Click the link below to verify your email address:</p>
        <a href="${verifyUrl}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">
          Verify Email
        </a>
        <p>This link expires in 24 hours.</p>
      `,
    });
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const resetUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/auth/reset-password?token=${token}`;
    await this.send({
      to,
      subject: "Reset your TableSnag password",
      html: `
        <h2>Password Reset</h2>
        <p>Click the link below to reset your password:</p>
        <a href="${resetUrl}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;">
          Reset Password
        </a>
        <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
      `,
    });
  }

  async sendBookingConfirmation(
    to: string,
    details: {
      restaurantName: string;
      date: string;
      time: string;
      partySize: number;
      platform: string;
      confirmationNumber?: string;
    }
  ): Promise<void> {
    await this.send({
      to,
      subject: `Reservation confirmed at ${details.restaurantName}!`,
      html: `
        <h2>Your reservation is confirmed!</h2>
        <table style="border-collapse:collapse;">
          <tr><td style="padding:8px;font-weight:bold;">Restaurant</td><td style="padding:8px;">${details.restaurantName}</td></tr>
          <tr><td style="padding:8px;font-weight:bold;">Date</td><td style="padding:8px;">${details.date}</td></tr>
          <tr><td style="padding:8px;font-weight:bold;">Time</td><td style="padding:8px;">${details.time}</td></tr>
          <tr><td style="padding:8px;font-weight:bold;">Party Size</td><td style="padding:8px;">${details.partySize}</td></tr>
          <tr><td style="padding:8px;font-weight:bold;">Platform</td><td style="padding:8px;">${details.platform}</td></tr>
          ${details.confirmationNumber ? `<tr><td style="padding:8px;font-weight:bold;">Confirmation #</td><td style="padding:8px;">${details.confirmationNumber}</td></tr>` : ""}
        </table>
        <p>TableSnag automatically secured this reservation for you.</p>
      `,
    });
  }

  private async send(msg: { to: string; subject: string; html: string }): Promise<void> {
    if (!config.SENDGRID_API_KEY) {
      console.log(`[EmailService] Would send email to ${msg.to}: ${msg.subject}`);
      return;
    }
    await sgMail.send({ ...msg, from: this.from });
  }
}

export const emailService = new EmailService();
