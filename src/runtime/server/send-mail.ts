import nodemailer, { type Transporter } from 'nodemailer'

import { useRuntimeConfig } from '#imports'

export interface MailerEmail {
  from: string
  to: string | string[]
  subject: string
  html?: string
  text?: string
}

let transport: Transporter | undefined

function getTransport(): Transporter {
  if (transport) {
    return transport
  }
  const cfg = useRuntimeConfig().mailer as { host: string; port: number }
  /* Gateway внутрикластерный, plaintext: без AUTH и без STARTTLS (ingest = authOptional +
     disabledCommands:['STARTTLS']). ignoreTLS отключает попытку STARTTLS-upgrade nodemailer'ом.
     pool — переиспользуем соединения под поток писем. */
  transport = nodemailer.createTransport({
    host: cfg.host,
    port: Number(cfg.port) || 587,
    secure: false,
    ignoreTLS: true,
    pool: true,
    maxConnections: 3,
  })
  return transport
}

/* Единый путь отправки письма для ВСЕХ проектов — через mailer-gateway (SMTP). Роутинг/квоты/
   доставка-трекинг — на стороне gateway. Бросает на ошибке соединения/отправки (воркер проекта
   ретраит/дедлеттерит). Возвращает messageId, присвоенный gateway. */
export async function sendMail(email: MailerEmail): Promise<{ messageId: string }> {
  const info = await getTransport().sendMail(email)
  return { messageId: info.messageId }
}
