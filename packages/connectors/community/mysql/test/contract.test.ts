import { describe, expect, it } from 'vitest';
import { connectorContract } from '@fema-ipaas/connector-sdk';
import { mysql } from '../src';

 describe('mysql reliability contract', () => {
  it('declares complete, consistent action metadata', () => {
    expect(connectorContract.violationsOf({ connector: mysql })).toEqual([]);
  });
});
