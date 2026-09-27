import { BlueprintVersionStatus } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { blueprintVersionStatusUtils } from '@/features/connector-blueprints/components/versions/version-status-utils';

describe('blueprintVersionStatusUtils', () => {
  it('labels the canary status and gives it the info badge tone', () => {
    expect(
      blueprintVersionStatusUtils.label(BlueprintVersionStatus.CANARY),
    ).toEqual('Rolling out to canary');
    expect(
      blueprintVersionStatusUtils.badgeVariant(BlueprintVersionStatus.CANARY),
    ).toEqual('info');
  });

  it('labels the full status and gives it the success badge tone', () => {
    expect(
      blueprintVersionStatusUtils.label(BlueprintVersionStatus.FULL),
    ).toEqual('Fully released');
    expect(
      blueprintVersionStatusUtils.badgeVariant(BlueprintVersionStatus.FULL),
    ).toEqual('success');
  });

  it('labels the stopped status and gives it the secondary badge tone', () => {
    expect(
      blueprintVersionStatusUtils.label(BlueprintVersionStatus.STOPPED),
    ).toEqual('Support stopped');
    expect(
      blueprintVersionStatusUtils.badgeVariant(BlueprintVersionStatus.STOPPED),
    ).toEqual('secondary');
  });
});
