import nodemailer from "nodemailer";

export async function sendMail(to: string, subject: string, html: string) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST) {
    // Dev fallback: no SMTP configured, print the email instead.
    console.log(`\n[mail disabled] To: ${to}\nSubject: ${subject}\n${html}\n`);
    return;
  }
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    secure: Number(SMTP_PORT) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  await transporter.sendMail({ from: SMTP_FROM, to, subject, html });
}
