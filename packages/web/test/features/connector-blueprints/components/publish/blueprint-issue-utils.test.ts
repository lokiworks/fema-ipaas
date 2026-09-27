import { BlueprintIssueCode, BlueprintIssueSection } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { blueprintIssueUtils } from '@/features/connector-blueprints/components/publish/blueprint-issue-utils';

describe('blueprintIssueUtils', () => {
  it('describes a basic-section issue and routes to the basic page', () => {
    const result = blueprintIssueUtils.describe({
      issue: {
        code: BlueprintIssueCode.NAME_MISSING,
        section: BlueprintIssueSection.BASIC,
        key: null,
        name: null,
      },
      blueprintId: 'bp1',
    });
    expect(result).toEqual({
      text: 'Connector name is not filled in',
      to: '/tenant/connectors/development/bp1/basic',
    });
  });

  it('routes an auth issue to the auth developer page', () => {
    const result = blueprintIssueUtils.describe({
      issue: {
        code: BlueprintIssueCode.AUTH_NOT_PUBLISHED,
        section: BlueprintIssueSection.AUTH,
        key: null,
        name: null,
      },
      blueprintId: 'bp1',
    });
    expect(result).toEqual({
      text: 'Authentication has not been published yet',
      to: '/tenant/connectors/development/bp1/auth/dev',
    });
  });

  it('routes a status issue to the status page', () => {
    const result = blueprintIssueUtils.describe({
      issue: {
        code: BlueprintIssueCode.STATUS_INVALID,
        section: BlueprintIssueSection.STATUS,
        key: null,
        name: null,
      },
      blueprintId: 'bp1',
    });
    expect(result).toEqual({
      text: 'Status code configuration is invalid',
      to: '/tenant/connectors/development/bp1/status',
    });
  });

  it('names the operation and routes to its editor by key', () => {
    const result = blueprintIssueUtils.describe({
      issue: {
        code: BlueprintIssueCode.OPERATION_INVALID,
        section: BlueprintIssueSection.OPERATION,
        key: 'create_ticket',
        name: 'Create ticket',
      },
      blueprintId: 'bp1',
    });
    expect(result).toEqual({
      text: 'Operation "Create ticket" is not fully configured',
      to: '/tenant/connectors/development/bp1/op/create_ticket',
    });
  });

  it('falls back to the key when a trigger issue has no name', () => {
    const result = blueprintIssueUtils.describe({
      issue: {
        code: BlueprintIssueCode.TRIGGER_INVALID,
        section: BlueprintIssueSection.TRIGGER,
        key: 'new_ticket',
        name: null,
      },
      blueprintId: 'bp1',
    });
    expect(result).toEqual({
      text: 'Trigger "new_ticket" is not fully configured',
      to: '/tenant/connectors/development/bp1/trigger/new_ticket',
    });
  });

  it('reports remaining checks with their own text', () => {
    expect(
      blueprintIssueUtils.describe({
        issue: {
          code: BlueprintIssueCode.NAME_TOO_LONG,
          section: BlueprintIssueSection.BASIC,
          key: null,
          name: null,
        },
        blueprintId: 'bp1',
      }).text,
    ).toEqual('Name is longer than 30 characters');
    expect(
      blueprintIssueUtils.describe({
        issue: {
          code: BlueprintIssueCode.DESCRIPTION_MISSING,
          section: BlueprintIssueSection.BASIC,
          key: null,
          name: null,
        },
        blueprintId: 'bp1',
      }).text,
    ).toEqual('Connector description is not filled in');
    expect(
      blueprintIssueUtils.describe({
        issue: {
          code: BlueprintIssueCode.BASE_URL_INVALID,
          section: BlueprintIssueSection.BASIC,
          key: null,
          name: null,
        },
        blueprintId: 'bp1',
      }).text,
    ).toEqual('Base URL is not configured or is invalid');
    expect(
      blueprintIssueUtils.describe({
        issue: {
          code: BlueprintIssueCode.NO_OPERATIONS,
          section: BlueprintIssueSection.BASIC,
          key: null,
          name: null,
        },
        blueprintId: 'bp1',
      }).text,
    ).toEqual('At least one operation or trigger is required');
  });
});
