import type { z } from 'zod';
import { prisma } from '../database/client.js';
import { recordAudit } from './audit.service.js';

/** Reads a validated config document, falling back to defaults if unset or no longer valid. */
export async function getConfig<S extends z.ZodType>(key: string, schema: S, defaults: z.output<S>): Promise<z.output<S>> {
  const row = await prisma.appConfig.findUnique({ where: { key } });
  const parsed = row ? schema.safeParse(row.value) : null;
  return parsed?.success ? parsed.data : defaults;
}

export async function setConfig<S extends z.ZodType>(key: string, schema: S, value: unknown, userId: string): Promise<z.output<S>> {
  const valid = schema.parse(value);
  await prisma.$transaction(async (tx) => {
    await tx.appConfig.upsert({
      where: { key },
      update: { value: valid as object, updatedById: userId },
      create: { key, value: valid as object, updatedById: userId },
    });
    await recordAudit({ action: 'CONFIG_UPDATED', userId, target: key, metadata: { value: valid as object } }, tx);
  });
  return valid;
}
