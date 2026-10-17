/* Стаб nitropack/runtime для юнит-тестов модуля: настоящий модуль живёт только внутри сборки Nitro. */
export function useRuntimeConfig() {
  return { mailer: { host: 'gw-host', port: 587 } }
}
