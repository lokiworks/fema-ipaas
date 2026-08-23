import { repoFactory } from '../core/db/repo-factory'
import { AuditEventEntity } from './audit-event.entity'

export const auditEventRepo = repoFactory(AuditEventEntity)
