import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../database/client.js';

type Db = Pick<typeof prisma, 'auditLog'>;

export interface AuditEvent {
  action: string;
  userId?: string;
  caseId?: string;
  target?: string;
  metadata?: Prisma.InputJsonObject;
}

export function recordAudit(event: AuditEvent, db: Db = prisma) {
  return db.auditLog.create({ data: { ...event, metadata: event.metadata ?? {} } });
}
