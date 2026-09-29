import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Tests run against a separate database so the demo data stays clean.
    env: { NODE_ENV: 'test', DATABASE_URL: 'postgresql://sih:sih_dev_password@localhost:5433/sih2_test?schema=public' },
    fileParallelism: false,
  },
});
