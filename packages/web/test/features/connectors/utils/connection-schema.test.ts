import { ConnectorAuth, Property } from '@fema-ipaas/connector-sdk';
import {
  CONNECTION_DISPLAY_NAME_MAX_LENGTH,
  ConnectionType,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { formUtils } from '@/features/connectors/utils/form-utils';

const customAuth = ConnectorAuth.CustomAuth({
  required: true,
  props: {
    appKey: Property.ShortText({ displayName: 'App Key', required: true }),
  },
});

function requestOf({ displayName }: { displayName: string }) {
  return {
    request: {
      externalId: 'beisen-main',
      displayName,
      connectorName: '@fema-ipaas/connector-beisen',
      projectId: 'project-1',
      type: ConnectionType.CUSTOM_AUTH,
      value: {
        type: ConnectionType.CUSTOM_AUTH,
        props: { appKey: 'key' },
      },
      projectIds: [],
      preSelectForNewProjects: false,
    },
  };
}

describe('formUtils.buildConnectionSchema display name', () => {
  const schema = formUtils.buildConnectionSchema(customAuth, {
    isGlobalConnection: false,
    showConnectionNameField: true,
  });

  it('accepts a name at the length limit', () => {
    const result = schema.safeParse(
      requestOf({
        displayName: 'a'.repeat(CONNECTION_DISPLAY_NAME_MAX_LENGTH),
      }),
    );

    expect(result.success).toBe(true);
  });

  it('rejects a name over the limit with the translation key the rename dialog uses', () => {
    const result = schema.safeParse(
      requestOf({
        displayName: 'a'.repeat(CONNECTION_DISPLAY_NAME_MAX_LENGTH + 1),
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      'connectionDisplayNameTooLong',
    );
  });
});
