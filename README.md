# @mttzzz/nuxt-mailer

Nuxt 4 module: единый путь отправки email через SMTP-gateway `mailer.pushka.biz`.

## Установка

```
bun add github:mttzzz/nuxt-mailer#main
```

`nuxt.config.ts`:

```ts
export default defineNuxtConfig({ modules: ['@mttzzz/nuxt-mailer'] })
```

## Использование (server)

`sendMail` авто-импортится в nitro-серверном контексте:

```ts
const { messageId } = await sendMail({ from, to, subject, html, text })
```

Бросает на ошибке отправки. Gateway сам роутит по провайдерам (приоритет+квоты), штампует
from домена провайдера и трекает доставку.

## Отмена отправки

`signal` (`AbortSignal`, nodemailer ≥ 10.5) отменяет отправку: письмо, ещё стоящее в очереди пула, снимается с очереди,
а соединение, по которому оно уже уходит, закрывается — зависший gateway не держит сокет до таймаутов nodemailer
(2 минуты на соединение, 10 минут тишины). Отправка падает ошибкой с `code: 'EABORT'` и `name: 'AbortError'`,
причина сигнала лежит в `cause` (у `AbortSignal.timeout()` это `TimeoutError`):

```ts
try {
  await sendMail({ from, to, subject, html, signal: AbortSignal.timeout(20_000) })
} catch (error) {
  if (error instanceof Error && 'code' in error && error.code === 'EABORT') {
    // gateway не ответил за 20 секунд
  }
}
```

Отмена не доказывает, что gateway письмо не принял: сигнал мог сработать уже после DATA, и повтор отправки тогда даст
второе письмо (доставка at-least-once).

## Конфиг

Хост/порт SMTP-gateway из окружения (дефолты generic):

- `NUXT_MAILER_HOST` — адрес gateway (дефолт `127.0.0.1`; задайте свой в env проекта);
- `NUXT_MAILER_PORT` — порт (дефолт `587`).

## Разработка

```
bun install
bun run prepare:types   # .nuxt модуля и playground: без них не работают lint и typecheck
bun run lint && bun run fmt:check && bun run test:types && bun run test
bun run build           # пересобрать dist/
```

`dist/` лежит в git: потребитель берёт пакет с GitHub, а `prepack` для такой зависимости не запускается. Поменяли
`src/` — пересоберите и закоммитьте `dist/`. CI (`.github/workflows/ci.yml`) падает, если `dist/` не совпадает со
сборкой из `src/`.
