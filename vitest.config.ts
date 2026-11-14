import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    globals: true,
    // Allow more memory for stress tests
    environmentOptions: {
      node: {
        experimentalMemoryBinding: true
      }
    },
    // Increase test timeout for long-running stress tests
    testTimeout: 30000,
    // Allow more output for stress test results
    outputTruncateLength: 100000
  },
});
