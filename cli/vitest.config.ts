import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Ogni test lancia la CLI come processo: qualche centinaio di millisecondi a testa.
    testTimeout: 20_000,
  },
})
