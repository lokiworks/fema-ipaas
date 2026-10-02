import {
  ConnectionScope,
  ConnectionStatus,
  ConnectionType,
  ConnectionWithoutSensitiveData,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { connectionUtils } from '@/features/connections/utils/utils';

function connection({
  externalId,
  status,
}: {
  externalId: string;
  status: ConnectionStatus;
}): ConnectionWithoutSensitiveData {
  return {
    id: externalId,
    created: '2026-10-01T00:00:00.000Z',
    updated: '2026-10-01T00:00:00.000Z',
    externalId,
    displayName: externalId,
    type: ConnectionType.SECRET_TEXT,
    connectorName: 'beisen',
    projectIds: [],
    tenantId: 'tenant',
    scope: ConnectionScope.PROJECT,
    status,
    ownerId: null,
    owner: null,
    metadata: null,
    workflowIds: null,
    connectorVersion: '1.0.0',
    preSelectForNewProjects: false,
  };
}

describe('connectionUtils.onlyUsableConnection', () => {
  it('returns null for an empty list', () => {
    expect(connectionUtils.onlyUsableConnection([])).toBeNull();
  });

  it('returns the single connection whatever its status', () => {
    const only = connection({
      externalId: 'a',
      status: ConnectionStatus.ERROR,
    });
    expect(connectionUtils.onlyUsableConnection([only])).toBe(only);
  });

  it('returns the single active connection among several', () => {
    const active = connection({
      externalId: 'b',
      status: ConnectionStatus.ACTIVE,
    });
    expect(
      connectionUtils.onlyUsableConnection([
        connection({ externalId: 'a', status: ConnectionStatus.ERROR }),
        active,
      ]),
    ).toBe(active);
  });

  it('returns null when several connections are active', () => {
    expect(
      connectionUtils.onlyUsableConnection([
        connection({ externalId: 'a', status: ConnectionStatus.ACTIVE }),
        connection({ externalId: 'b', status: ConnectionStatus.ACTIVE }),
      ]),
    ).toBeNull();
  });
});
