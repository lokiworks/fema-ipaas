import { describe, expect, it } from 'vitest';
import { connectorContract } from '@fema-ipaas/connector-sdk';
import { postgres } from '../src';

 describe('postgres reliability contract', () => {
  it('declares complete, consistent action metadata', () => {
    expect(connectorContract.violationsOf({ connector: postgres })).toEqual([]);
  });
});
