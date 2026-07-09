import { afterEach, describe, expect, it, vi } from 'vitest'

const sendMailMock = vi.fn(async () => ({ messageId: 'mid-123' }))
const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }))
vi.mock('nodemailer', () => ({ default: { createTransport: createTransportMock } }))

const { sendMail } = await import('../src/runtime/server/send-mail')

describe('sendMail', () => {
  afterEach(() => {
    sendMailMock.mockClear()
  })

  it('шлёт через nodemailer-транспорт и возвращает messageId', async () => {
    const email = { from: 'a@x.com', to: 'b@y.com', subject: 's', html: '<p>h</p>' }
    const res = await sendMail(email)
    expect(res.messageId).toBe('mid-123')
    expect(sendMailMock).toHaveBeenCalledWith(email)
  })

  it('транспорт до gateway из runtimeConfig (host/port, plaintext, ignoreTLS)', async () => {
    await sendMail({ from: 'a@x.com', to: 'b@y.com', subject: 's', text: 't' })
    const opts = createTransportMock.mock.calls[0]![0]
    expect(opts).toMatchObject({ host: 'gw-host', port: 587, secure: false, ignoreTLS: true, pool: true })
  })
})
