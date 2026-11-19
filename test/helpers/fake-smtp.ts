import { type Socket, createServer } from 'node:net'

/* Поддельный SMTP-gateway для тестов: ровно столько протокола, сколько нужно настоящему nodemailer'у
   (EHLO, MAIL FROM, RCPT TO, DATA, RSET, NOOP, QUIT), и ответы, которыми управляет тест. */

export interface FakeSmtpScript {
  /* Ответ на каждый RCPT TO. По умолчанию `250 OK`. */
  rcpt?: string
  /* Ответ на конец DATA по номеру письма (с единицы): строка — ответ, `null` — молчит, как зависший gateway.
     По умолчанию `250 OK queued`. */
  data?: (messageNumber: number) => string | null
  /* Объявлять PIPELINING в ответе на EHLO (боевой gateway — smtp-server — объявляет). По умолчанию да. */
  pipelining?: boolean
}

export interface FakeSmtpMessage {
  from: string
  to: string[]
  /* Тело DATA как пришло, без завершающей точки. */
  raw: string
}

export interface FakeSmtp {
  port: number
  /* Письма, дошедшие до конца DATA, — ответил им gateway или нет. */
  messages: FakeSmtpMessage[]
  /* Принятые соединения. */
  connections: number
  /* Соединения, которые уже закрыты (чьей стороной — неважно). */
  closedConnections: number
  close: () => Promise<void>
}

interface Session {
  buffer: string
  inData: boolean
  hung: boolean
  from: string
  to: string[]
}

const CRLF = '\r\n'
const DATA_END = '\r\n.\r\n'
const ANGLE_ADDRESS = /<(?<address>[^>]*)>/u

function addressOf(line: string): string {
  return ANGLE_ADDRESS.exec(line)?.groups?.address ?? ''
}

function serve(socket: Socket, smtp: FakeSmtp, script: FakeSmtpScript): void {
  const session: Session = { buffer: '', inData: false, hung: false, from: '', to: [] }

  function reply(line: string): void {
    socket.write(line + CRLF)
  }

  function reset(): void {
    session.from = ''
    session.to = []
  }

  function finishData(raw: string): void {
    session.inData = false
    smtp.messages.push({ from: session.from, to: session.to, raw })
    const answer = script.data ? script.data(smtp.messages.length) : '250 OK queued'
    reset()
    if (answer === null) {
      session.hung = true
      return
    }
    reply(answer)
  }

  function command(line: string): void {
    const [verb = ''] = line.toUpperCase().split(' ')
    switch (verb) {
      case 'EHLO': {
        reply('250-fake-gateway')
        if (script.pipelining !== false) {
          reply('250-PIPELINING')
        }
        reply('250 8BITMIME')
        break
      }
      case 'HELO': {
        reply('250 fake-gateway')
        break
      }
      case 'MAIL': {
        session.from = addressOf(line)
        reply('250 OK')
        break
      }
      case 'RCPT': {
        const answer = script.rcpt ?? '250 OK'
        if (answer.startsWith('2')) {
          session.to.push(addressOf(line))
        }
        reply(answer)
        break
      }
      case 'DATA': {
        /* Как боевой gateway (smtp-server): без принятого получателя DATA не берёт. PIPELINING-клиент шлёт DATA, не
           дожидаясь ответов на RCPT, и итог конверта узнаёт именно по этому ответу. */
        if (session.to.length === 0) {
          reply('503 Error: need RCPT command')
          break
        }
        session.inData = true
        reply('354 go ahead')
        break
      }
      case 'RSET': {
        reset()
        reply('250 OK')
        break
      }
      case 'NOOP': {
        reply('250 OK')
        break
      }
      case 'QUIT': {
        reply('221 bye')
        socket.end()
        break
      }
      default: {
        reply('502 command not implemented')
      }
    }
  }

  function drain(): void {
    while (!session.hung) {
      if (session.inData) {
        const end = session.buffer.indexOf(DATA_END)
        if (end === -1) {
          return
        }
        const raw = session.buffer.slice(0, end)
        session.buffer = session.buffer.slice(end + DATA_END.length)
        finishData(raw)
        continue
      }
      const end = session.buffer.indexOf(CRLF)
      if (end === -1) {
        return
      }
      const line = session.buffer.slice(0, end)
      session.buffer = session.buffer.slice(end + CRLF.length)
      command(line)
    }
  }

  socket.setEncoding('latin1')
  socket.on('data', (chunk: string) => {
    session.buffer += chunk
    drain()
  })
  // ECONNRESET при закрытии со стороны клиента — штатный исход тестов отмены.
  socket.on('error', () => {})
  reply('220 fake-gateway ESMTP')
}

export function startFakeSmtp(script: FakeSmtpScript = {}): Promise<FakeSmtp> {
  const sockets = new Set<Socket>()
  const server = createServer()
  const smtp: FakeSmtp = {
    port: 0,
    messages: [],
    connections: 0,
    closedConnections: 0,
    close() {
      for (const socket of sockets) {
        socket.destroy()
      }
      const closed = Promise.withResolvers<void>()
      server.close(() => {
        closed.resolve()
      })
      return closed.promise
    },
  }
  server.on('connection', (socket) => {
    smtp.connections++
    sockets.add(socket)
    socket.once('close', () => {
      smtp.closedConnections++
      sockets.delete(socket)
    })
    serve(socket, smtp, script)
  })

  const listening = Promise.withResolvers<FakeSmtp>()
  server.once('error', listening.reject)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    if (address === null || typeof address === 'string') {
      listening.reject(new Error('Поддельный SMTP не получил порт'))
      return
    }
    smtp.port = address.port
    listening.resolve(smtp)
  })
  return listening.promise
}
