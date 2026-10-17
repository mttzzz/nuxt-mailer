/* Явный импорт, а не '#imports': под compat 5 (Nuxt ≥ 4.6.2, nitroAutoImports: false) хелперы
   nitropack в виртуальном '#imports' больше нет, и сборка падала бы на этом файле. */
import { useRuntimeConfig } from 'nitropack/runtime'
import nodemailer, { type Transporter } from 'nodemailer'
import type SMTPPool from 'nodemailer/lib/smtp-pool'

export interface MailerEmail {
  from: string
  to: string | string[]
  subject: string
  html?: string
  text?: string
}

let transport: Transporter<SMTPPool.SentMessageInfo> | undefined

function getTransport(): Transporter<SMTPPool.SentMessageInfo> {
  if (transport) {
    return transport
  }
  const cfg = useRuntimeConfig().mailer
  /* Gateway внутрикластерный, plaintext: без AUTH и без STARTTLS (ingest = authOptional +
     disabledCommands:['STARTTLS']). ignoreTLS отключает попытку STARTTLS-upgrade nodemailer'ом.
     pool — переиспользуем соединения под поток писем. */
  transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port || 587,
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
