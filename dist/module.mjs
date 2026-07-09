import { defineNuxtModule, createResolver, addServerImports } from '@nuxt/kit';

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 587;
const module$1 = defineNuxtModule({
  meta: {
    name: "@mttzzz/nuxt-mailer",
    configKey: "mailer",
    compatibility: { nuxt: "^4.0.0" }
  },
  defaults: {},
  setup(opts, nuxt) {
    const resolver = createResolver(import.meta.url);
    const existing = nuxt.options.runtimeConfig.mailer ?? {};
    nuxt.options.runtimeConfig.mailer = {
      host: opts.host ?? existing.host ?? DEFAULT_HOST,
      port: opts.port ?? existing.port ?? DEFAULT_PORT
    };
    addServerImports([{ name: "sendMail", from: resolver.resolve("./runtime/server/send-mail") }]);
  }
});

export { module$1 as default };
