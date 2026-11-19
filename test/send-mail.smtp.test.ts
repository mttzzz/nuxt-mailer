import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MailerEmail } from '../src/runtime/server/send-mail'
import { type FakeSmtp, type FakeSmtpScript, startFakeSmtp } from './helpers/fake-smtp'

/* Настоящий nodemailer, без моков, против поддельного SMTP-gateway. Мокнутый транспорт (send-mail.test.ts) не ловит
   три вещи, на которых держатся проекты: что смена мажора nodemailer не сломала отправку, какие `code` и
   `responseCode` приходят с отказом gateway (по ним воркеры решают «повторить или отказать навсегда») и что
   `signal` действительно отменяет отправку и закрывает соединение. */

type SendMail = (email: MailerEmail) => Promise<{ messageId: string }>

/* Что тесты читают из ошибки nodemailer; `cause` у Error — собственное неперечисляемое свойство. */
interface ErrorFacts {
  name?: unknown
  code?: unknown
  responseCode?: unknown
  cause?: unknown
}

const MAIL: MailerEmail = {
  from: 'a@x.com',
  to: 'b@y.com',
  subject: 'Login code',
  html: '<p>123456</p>',
  text: '123456',
}

/* Пул nodemailer в send-mail.ts — maxConnections: 3. */
const POOL_SIZE = 3

const MESSAGE_ID_HEADER = /^Message-ID: <?(?<id>[^>\r\n]+)>?$/imu
const ANGLE_BRACKETS = /[<>]/gu

const servers: FakeSmtp[] = []

async function gateway(script?: FakeSmtpScript): Promise<FakeSmtp> {
  const smtp = await startFakeSmtp(script)
  servers.push(smtp)
  return smtp
}

/* Транспорт sendMail живёт в переменной модуля, а порт поддельного gateway известен только в тесте: статический
   импорт не годится — нужен свежий модуль (и свежий пул) на каждый тест. */
async function loadSendMail(smtp: FakeSmtp): Promise<SendMail> {
  vi.resetModules()
  vi.doMock('nitropack/runtime', () => ({
    useRuntimeConfig: () => ({ mailer: { host: '127.0.0.1', port: smtp.port } }),
  }))
  const { sendMail } = await import('../src/runtime/server/send-mail')
  return sendMail
}

/* Отказ отправки как значение. Оборачивать сразу при вызове sendMail: так отказ не остаётся без обработчика. */
async function failure(sending: Promise<unknown>): Promise<unknown> {
  try {
    await sending
  } catch (error: unknown) {
    return error
  }
  throw new Error('Отправка должна была упасть')
}

function errorFacts(error: unknown): ErrorFacts {
  if (typeof error !== 'object' || error === null) {
    return {}
  }
  return {
    name: 'name' in error ? error.name : undefined,
    code: 'code' in error ? error.code : undefined,
    responseCode: 'responseCode' in error ? error.responseCode : undefined,
    cause: 'cause' in error ? error.cause : undefined,
  }
}

function until(assertion: () => void): Promise<void> {
  return vi.waitFor(assertion, { timeout: 5000 })
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((smtp) => smtp.close()))
})

describe('sendMail → настоящий nodemailer', () => {
  it.each([{ pipelining: true }, { pipelining: false }])(
    'письмо доходит до gateway: конверт, тело, messageId (PIPELINING: $pipelining)',
    async ({ pipelining }) => {
      const smtp = await gateway({ pipelining })
      const sendMail = await loadSendMail(smtp)

      const { messageId } = await sendMail({
        ...MAIL,
        to: ['b@y.com', 'c@y.com'],
        signal: new AbortController().signal,
      })

      expect(smtp.messages).toHaveLength(1)
      const [message] = smtp.messages
      expect(message?.from).toBe('a@x.com')
      expect(message?.to).toEqual(['b@y.com', 'c@y.com'])
      expect(message?.raw).toContain('Subject: Login code')
      expect(message?.raw).toContain('<p>123456</p>')
      // Message-ID — заголовок самого письма, а не ответ gateway.
      expect(messageId).toBeTruthy()
      expect(MESSAGE_ID_HEADER.exec(message?.raw ?? '')?.groups?.id).toBe(messageId.replaceAll(ANGLE_BRACKETS, ''))
    },
  )

  it.each([
    { rcpt: '550 No such user', responseCode: 550, pipelining: true },
    { rcpt: '550 No such user', responseCode: 550, pipelining: false },
    { rcpt: '450 Try again later', responseCode: 450, pipelining: true },
    { rcpt: '450 Try again later', responseCode: 450, pipelining: false },
  ])(
    'отказ gateway на RCPT «$rcpt» (PIPELINING: $pipelining) → EENVELOPE и responseCode $responseCode',
    async ({ rcpt, responseCode, pipelining }) => {
      const smtp = await gateway({ rcpt, pipelining })
      const sendMail = await loadSendMail(smtp)

      const error = await failure(sendMail(MAIL))

      expect(errorFacts(error)).toMatchObject({ code: 'EENVELOPE', responseCode })
      expect(smtp.messages).toHaveLength(0)
    },
  )

  it.each([
    { data: '554 Message rejected', responseCode: 554, pipelining: true },
    { data: '554 Message rejected', responseCode: 554, pipelining: false },
    { data: '451 Temporary storage failure', responseCode: 451, pipelining: true },
    { data: '451 Temporary storage failure', responseCode: 451, pipelining: false },
  ])(
    'отказ gateway после DATA «$data» (PIPELINING: $pipelining) → EMESSAGE и responseCode $responseCode, без скрытых повторов',
    async ({ data, responseCode, pipelining }) => {
      const smtp = await gateway({ data: () => data, pipelining })
      const sendMail = await loadSendMail(smtp)

      const error = await failure(sendMail(MAIL))

      expect(errorFacts(error)).toMatchObject({ code: 'EMESSAGE', responseCode })
      expect(smtp.messages).toHaveLength(1)
    },
  )

  it('gateway недоступен → ошибка соединения, а не отказ письма', async () => {
    const smtp = await gateway()
    const sendMail = await loadSendMail(smtp)
    await smtp.close()

    const error = await failure(sendMail(MAIL))

    expect(errorFacts(error).code).toBeOneOf(['ECONNECTION', 'ESOCKET'])
  })
})

describe('sendMail: signal', () => {
  it('сигнал, отменённый заранее: EABORT, до gateway дело не доходит', async () => {
    const smtp = await gateway()
    const sendMail = await loadSendMail(smtp)

    const error = await failure(sendMail({ ...MAIL, signal: AbortSignal.abort() }))

    expect(errorFacts(error)).toMatchObject({ name: 'AbortError', code: 'EABORT' })
    expect(smtp.connections).toBe(0)
  })

  it('отмена письма, зависшего на DATA: EABORT, причина в cause, соединение закрыто', async () => {
    const smtp = await gateway({ data: () => null })
    const sendMail = await loadSendMail(smtp)
    const controller = new AbortController()
    const reason = new Error('Хватит ждать')

    const outcome = failure(sendMail({ ...MAIL, signal: controller.signal }))
    await until(() => {
      expect(smtp.messages).toHaveLength(1)
    })
    controller.abort(reason)

    const facts = errorFacts(await outcome)
    expect(facts).toMatchObject({ name: 'AbortError', code: 'EABORT' })
    expect(facts.cause).toBe(reason)
    await until(() => {
      expect(smtp.closedConnections).toBe(1)
    })
  })

  it('AbortSignal.timeout: EABORT с причиной TimeoutError — замена гонки с таймером', async () => {
    const smtp = await gateway({ data: () => null })
    const sendMail = await loadSendMail(smtp)

    const error = await failure(sendMail({ ...MAIL, signal: AbortSignal.timeout(100) }))
    const facts = errorFacts(error)

    expect(facts).toMatchObject({ name: 'AbortError', code: 'EABORT' })
    expect(errorFacts(facts.cause).name).toBe('TimeoutError')
    await until(() => {
      expect(smtp.closedConnections).toBe(1)
    })
  })

  it('отмена письма в очереди пула снимает его, не открывая нового соединения', async () => {
    const smtp = await gateway({ data: () => null })
    const sendMail = await loadSendMail(smtp)
    const busy = Array.from({ length: POOL_SIZE }, () => new AbortController())
    const busyOutcomes = busy.map((controller) => failure(sendMail({ ...MAIL, signal: controller.signal })))
    await until(() => {
      expect(smtp.messages).toHaveLength(POOL_SIZE)
    })

    const queued = new AbortController()
    const queuedOutcome = failure(sendMail({ ...MAIL, signal: queued.signal }))
    queued.abort()

    expect(errorFacts(await queuedOutcome).code).toBe('EABORT')
    expect(smtp.connections).toBe(POOL_SIZE)
    expect(smtp.messages).toHaveLength(POOL_SIZE)

    for (const controller of busy) {
      controller.abort()
    }
    await Promise.all(busyOutcomes)
  })

  it('после отмены пул жив: следующее письмо уходит по новому соединению', async () => {
    const smtp = await gateway({ data: (number) => (number === 1 ? null : '250 OK queued') })
    const sendMail = await loadSendMail(smtp)
    const controller = new AbortController()
    const first = failure(sendMail({ ...MAIL, signal: controller.signal }))
    await until(() => {
      expect(smtp.messages).toHaveLength(1)
    })
    controller.abort()
    expect(errorFacts(await first).code).toBe('EABORT')

    const { messageId } = await sendMail(MAIL)

    expect(messageId).toBeTruthy()
    expect(smtp.messages).toHaveLength(2)
    expect(smtp.connections).toBe(2)
  })
})
