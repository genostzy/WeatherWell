import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
const sendMail = vi.fn();
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail }) } }));

beforeEach(() => {
  vi.resetModules();
  sendMail.mockReset();
  sendMail.mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const recipients = [
  { email: "a@gmail.com", unsubscribeToken: "token-a" },
  { email: "b@gmail.com", unsubscribeToken: "token-b" },
];

describe("sendNoticeEmails", () => {
  it("sends nothing, and says why, until the Gmail app password is set", async () => {
    vi.stubEnv("GMAIL_USER", "");
    vi.stubEnv("GMAIL_APP_PASSWORD", "");
    const { sendNoticeEmails, EMAIL_NOT_CONFIGURED } = await import("./send-email");
    expect(await sendNoticeEmails(recipients, { subject: "s", text: "t" })).toEqual({ ok: false, error: EMAIL_NOT_CONFIGURED });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("emails each recipient separately, each with their own way to stop", async () => {
    vi.stubEnv("GMAIL_USER", "weatherwell.alerts@gmail.com");
    vi.stubEnv("GMAIL_APP_PASSWORD", "app-password");
    const { sendNoticeEmails } = await import("./send-email");

    expect(await sendNoticeEmails(recipients, { subject: "Flood", text: "Water is rising.", path: "/admin" })).toEqual({
      ok: true,
      sent: 2,
      failed: 0,
    });
    const first = sendMail.mock.calls[0][0];
    expect(first).toMatchObject({ from: "WeatherWell <weatherwell.alerts@gmail.com>", to: "a@gmail.com", subject: "Flood" });
    expect(first.text).toContain("Water is rising.");
    expect(first.text).toContain("https://weatherwell.vercel.app/admin");
    expect(first.text).toContain("https://weatherwell.vercel.app/unsubscribe?token=token-a");
    expect(first.text).not.toContain("token-b");
    expect(first.headers).toEqual({
      "List-Unsubscribe": "<https://weatherwell.vercel.app/api/email/unsubscribe?token=token-a>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("counts a failed send instead of throwing", async () => {
    vi.stubEnv("GMAIL_USER", "weatherwell.alerts@gmail.com");
    vi.stubEnv("GMAIL_APP_PASSWORD", "app-password");
    sendMail.mockRejectedValueOnce(new Error("550 mailbox unavailable"));
    const { sendNoticeEmails } = await import("./send-email");
    expect(await sendNoticeEmails(recipients, { subject: "s", text: "t" })).toEqual({ ok: true, sent: 1, failed: 1 });
  });
});
