import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/** Where an email's links point: production unless APP_URL says otherwise. */
const APP_URL = (process.env.APP_URL ?? "https://weatherwell.vercel.app").replace(/\/+$/, "");

export const EMAIL_NOT_CONFIGURED = "Email not configured";

export interface EmailRecipient {
  email: string;
  unsubscribeToken: string;
}

export interface EmailNotice {
  subject: string;
  text: string;
  /** The page the email links to; "/" by default. */
  path?: string;
}

export type EmailResult = { ok: true; sent: number; failed: number } | { ok: false; error: string };

let transport: Transporter | null = null;

/** WeatherWell's own Gmail account, through an app password (Setup). */
function gmail(): Transporter | null {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  // Pooled, three at a time: Gmail refuses a burst of parallel connections.
  transport ??= nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    pool: true,
    maxConnections: 3,
    auth: { user, pass },
  });
  return transport;
}

export function emailConfigured(): boolean {
  return !!process.env.GMAIL_USER && !!process.env.GMAIL_APP_PASSWORD;
}

/** The page a person lands on from an email's "stop these emails" link. */
export function unsubscribeUrl(token: string): string {
  return `${APP_URL}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * Sends a notice to each recipient separately, each with their own
 * unsubscribe link and a one-click List-Unsubscribe header (RFC 8058), so
 * Gmail shows its own Unsubscribe button. Best effort: failures are counted,
 * never thrown.
 */
export async function sendNoticeEmails(recipients: EmailRecipient[], notice: EmailNotice): Promise<EmailResult> {
  const transporter = gmail();
  if (!transporter) return { ok: false, error: EMAIL_NOT_CONFIGURED };
  if (recipients.length === 0) return { ok: true, sent: 0, failed: 0 };

  const link = `${APP_URL}${notice.path ?? "/"}`;
  const results = await Promise.allSettled(
    recipients.map((recipient) => {
      const stop = unsubscribeUrl(recipient.unsubscribeToken);
      const oneClick = `${APP_URL}/api/email/unsubscribe?token=${encodeURIComponent(recipient.unsubscribeToken)}`;
      return transporter.sendMail({
        from: `WeatherWell <${process.env.GMAIL_USER}>`,
        to: recipient.email,
        subject: notice.subject,
        text: `${notice.text}\n\nOpen WeatherWell: ${link}\n\nStop these emails / Itigil ang mga email na ito: ${stop}\n`,
        headers: {
          "List-Unsubscribe": `<${oneClick}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
    })
  );
  const sent = results.filter((result) => result.status === "fulfilled").length;
  return { ok: true, sent, failed: results.length - sent };
}
