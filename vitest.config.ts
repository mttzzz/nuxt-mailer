import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'node' },
  resolve: { alias: { '#imports': new URL('./test/imports-stub.ts', import.meta.url).pathname } },
})
