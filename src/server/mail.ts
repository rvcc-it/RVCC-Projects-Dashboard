import "server-only";
import nodemailer from "nodemailer";

export type MailResult = { sent: boolean; mode: "smtp" | "console" };

/** Sends via SMTP when configured; otherwise prints the message to the server console (dev). */
export async function sendMail(to: string, subject: string, text: string): Promise<MailResult> {
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.log(`\n[mail:console] To: ${to}\nSubject: ${subject}\n${text}\n`);
    return { sent: false, mode: "console" };
  }
  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await transport.sendMail({ from: process.env.SMTP_FROM || "no-reply@localhost", to, subject, text });
  return { sent: true, mode: "smtp" };
}
