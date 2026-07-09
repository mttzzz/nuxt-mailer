import nodemailer from "nodemailer";
import { useRuntimeConfig } from "#imports";
let transport;
function getTransport() {
  if (transport) {
    return transport;
  }
  const cfg = useRuntimeConfig().mailer;
  transport = nodemailer.createTransport({
    host: cfg.host,
    port: Number(cfg.port) || 587,
    secure: false,
    ignoreTLS: true,
    pool: true,
    maxConnections: 3
  });
  return transport;
}
export async function sendMail(email) {
  const info = await getTransport().sendMail(email);
  return { messageId: info.messageId };
}
