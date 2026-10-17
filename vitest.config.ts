import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'node' },
  resolve: { alias: { 'nitropack/runtime': new URL('test/runtime-stub.ts', import.meta.url).pathname } },
})
