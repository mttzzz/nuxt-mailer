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

## Конфиг
Хост/порт SMTP-gateway из окружения (дефолты generic):
- `NUXT_MAILER_HOST` — адрес gateway (дефолт `127.0.0.1`; задайте свой в env проекта);
- `NUXT_MAILER_PORT` — порт (дефолт `587`).
