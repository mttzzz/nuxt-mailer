/* Явный импорт, а не '#imports': под compat 5 (Nuxt ≥ 4.6.2, nitroAutoImports: false) хелперы
   nitropack в виртуальном '#imports' больше нет, и сборка падала бы на этом файле. */
import { useRuntimeConfig } from 'nitropack/runtime'
import { type SMTPPoolSentMessageInfo, type Transporter, createTransport } from 'nodemailer'

export interface MailerEmail {
  from: string
  to: string | string[]
  subject: string
  html?: string
  text?: string
  /* Отмена отправки (nodemailer ≥ 10.5). Письмо в очереди пула снимается с очереди, а соединение, по которому оно уже
     уходит, закрывается: зависший gateway держит сокет не до таймаутов nodemailer (2 мин на соединение, 10 мин
     тишины), а до сигнала. Отправка падает ошибкой `code: 'EABORT'`, `name: 'AbortError'`, `cause` = `signal.reason`
     (у `AbortSignal.timeout()` это `TimeoutError`). Отмена НЕ доказывает, что gateway письмо не принял: если сигнал
     сработал уже после DATA, повтор даст второе письмо (доставка at-least-once). */
  signal?: AbortSignal | undefined
}

let transport: Transporter<SMTPPoolSentMessageInfo> | undefined

function getTransport(): Transporter<SMTPPoolSentMessageInfo> {
  if (transport) {
    return transport
  }
  const cfg = useRuntimeConfig().mailer
  /* Gateway внутрикластерный, plaintext: без AUTH и без STARTTLS (ingest = authOptional +
     disabledCommands:['STARTTLS']). ignoreTLS отключает попытку STARTTLS-upgrade nodemailer'ом.
     pool — переиспользуем соединения под поток писем. */
  transport = createTransport({
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
   ретраит/дедлеттерит). Возвращает messageId — Message-ID самого письма: его назначает nodemailer при сборке
   письма, а не gateway. */
export async function sendMail(email: MailerEmail): Promise<{ messageId: string }> {
  const info = await getTransport().sendMail(email)
  return { messageId: info.messageId }
}
