import { randomBytes } from 'node:crypto';
import type { SahyogStatus } from '../generated/prisma/client.js';

/**
 * MOCK SAHYOG endpoint. No network call is made and nothing leaves this system: it only mints a
 * clearly-prefixed reference and walks the request through a simulated lifecycle when asked.
 * A real adapter would replace these two functions; the UI labels every non-PREPARED state as MOCK.
 */
export const MOCK_NOTICE = 'MOCK SAHYOG: simulated exchange. No real request was transmitted to any authority or VASP.';

export function mockSubmit(): { reference: string } {
  return { reference: `MOCK-SAHYOG-${randomBytes(4).toString('hex').toUpperCase()}` };
}

const ORDER: SahyogStatus[] = ['PREPARED', 'SUBMITTED', 'ACKNOWLEDGED', 'FULFILLED'];
export const nextMockStatus = (s: SahyogStatus): SahyogStatus | null => ORDER[ORDER.indexOf(s) + 1] ?? null;
