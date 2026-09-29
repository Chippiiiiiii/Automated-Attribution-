import { existsSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Root .env, found from both src/config (tsx/vitest) and dist/src/config (compiled) — override with DOTENV_PATH.
const rootEnv = ['../../../.env', '../../../../.env'].map((p) => path.resolve(import.meta.dirname, p)).find((p) => existsSync(p));
dotenv.config({ path: process.env.DOTENV_PATH ?? rootEnv ?? '', quiet: true });

const optionalString = z.string().trim().transform((v) => v || undefined).optional();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  // Normalised to scheme+host so a stray path (e.g. a full page URL) or trailing
  // slash can't break origin matching. Non-URL values (e.g. "*") pass through.
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:5173')
    .transform((v) => {
      const t = v.trim();
      try {
        return new URL(t).origin;
      } catch {
        return t;
      }
    }),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  /** DEMO = built-in synthetic ledger (no keys). LIVE = real explorer APIs, per-chain adapters in blockchain/live. */
  BLOCKCHAIN_PROVIDER: z.enum(['DEMO', 'LIVE']).default('DEMO'),
  /** Blank values in .env count as unset. Never logged or returned by the API. */
  ETHEREUM_API_KEY: optionalString,
  BITCOIN_API_KEY: optionalString,
  TRON_API_KEY: optionalString,
  SOLANA_API_KEY: optionalString,
  ETHERSCAN_BASE_URL: z.url().default('https://api.etherscan.io/v2/api'),
  BITCOIN_API_URL: z.url().default('https://blockstream.info/api'),
  SAHYOG_MODE: z.enum(['MOCK']).default('MOCK'),
});

export const env = schema
  .refine((e) => e.NODE_ENV !== 'production' || !/^change-me/i.test(e.JWT_SECRET), {
    path: ['JWT_SECRET'],
    message: 'JWT_SECRET is still the .env.example placeholder; set a long random value in production',
  })
  .parse(process.env);
