import { describe, expect, it } from 'vitest';
import { connectorContract } from '@fema-ipaas/connector-sdk';
import { feishu } from '../src';
import { feishuErrorTable } from '../src/lib/common/error-table';

describe('feishu reliability contract', () => {
  it('assigns every non-retryable vendor error to an owner', () => {
    expect(feishuErrorTable.rules().filter((rule) => rule.kind === 'FAILED' && !rule.owner)).toEqual([]);
  });

  it('declares complete, consistent action metadata', () => {
    expect(connectorContract.violationsOf({ connector: feishu })).toEqual([]);
  });
});
