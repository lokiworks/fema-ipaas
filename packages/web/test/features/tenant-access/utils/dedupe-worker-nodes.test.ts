import { WorkerNode, WorkerNodeStatus } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { tenantAccessUtils } from '@/features/tenant-access/utils/tenant-access-utils';

describe('tenantAccessUtils.dedupeWorkerNodes', () => {
  it('keeps only the latest offline record of a machine', () => {
    const result = tenantAccessUtils.dedupeWorkerNodes([
      node({ id: 'old', ip: 'a', heartbeat: '2026-10-27T04:00:00.000Z' }),
      node({ id: 'new', ip: 'a', heartbeat: '2026-10-27T14:00:00.000Z' }),
    ]);
    expect(result.map((entry) => entry.id)).toEqual(['new']);
  });

  it('drops offline duplicates when the machine is online', () => {
    const result = tenantAccessUtils.dedupeWorkerNodes([
      node({ id: 'stale', ip: 'a', heartbeat: '2026-10-27T04:00:00.000Z' }),
      node({
        id: 'live',
        ip: 'a',
        heartbeat: '2026-10-27T14:00:00.000Z',
        status: WorkerNodeStatus.ONLINE,
      }),
    ]);
    expect(result.map((entry) => entry.id)).toEqual(['live']);
  });

  it('keeps different machines apart', () => {
    const result = tenantAccessUtils.dedupeWorkerNodes([
      node({ id: 'one', ip: 'a', heartbeat: '2026-10-27T04:00:00.000Z' }),
      node({ id: 'two', ip: 'b', heartbeat: '2026-10-27T04:00:00.000Z' }),
    ]);
    expect(result).toHaveLength(2);
  });
});

function node({
  id,
  ip,
  heartbeat,
  status = WorkerNodeStatus.OFFLINE,
}: {
  id: string;
  ip: string;
  heartbeat: string;
  status?: WorkerNodeStatus;
}): WorkerNode {
  return {
    id,
    ip,
    status,
    version: '1.0.0',
    versionMatchesApp: true,
    labels: [],
    concurrency: 2,
    cpuUsagePercentage: null,
    ramUsagePercentage: null,
    busySandboxes: 0,
    workerGroupId: null,
    connectedAt: heartbeat,
    lastHeartbeatAt: heartbeat,
    drainedAt: null,
  };
}
