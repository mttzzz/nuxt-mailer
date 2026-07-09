import { addServerImports, createResolver, defineNuxtModule } from '@nuxt/kit'

export interface ModuleOptions {
  /* SMTP-хост mailer-gateway. По умолчанию внутрикластерный ClusterIP.
     Оверрайд рантайм-энвой NUXT_MAILER_HOST. */
  host?: string
  /* SMTP-порт gateway (по умолчанию 587). Оверрайд NUXT_MAILER_PORT. */
  port?: number
}

/* Generic-дефолты (модуль публичный, без внутренней инфры). Реальный gateway-host каждый проект
   задаёт через NUXT_MAILER_HOST в своём окружении. */
const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 587

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@mttzzz/nuxt-mailer',
    configKey: 'mailer',
    compatibility: { nuxt: '^4.0.0' },
  },
  defaults: {},
  setup(opts, nuxt) {
    const resolver = createResolver(import.meta.url)

    /* Server-only runtimeConfig.mailer — host/port оверрайдятся NUXT_MAILER_HOST / NUXT_MAILER_PORT
       (Nuxt мапит env только на объявленные ключи, поэтому объявляем их с дефолтами). */
    const existing = (nuxt.options.runtimeConfig.mailer ?? {}) as { host?: string; port?: number }
    nuxt.options.runtimeConfig.mailer = {
      host: opts.host ?? existing.host ?? DEFAULT_HOST,
      port: opts.port ?? existing.port ?? DEFAULT_PORT,
    }

    /* sendMail — авто-импорт в nitro-серверном контексте всех проектов: единый путь отправки. */
    addServerImports([{ name: 'sendMail', from: resolver.resolve('./runtime/server/send-mail') }])
  },
})
