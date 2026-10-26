import { connectorContract } from '@fema-ipaas/connector-sdk';
import { wecom } from '../src';
import { wecomErrorTable } from '../src/lib/common/error-table';

it('satisfies the first-party reliability contract', () => {
  expect(connectorContract.violationsOf({ connector: wecom })).toEqual([]);
  expect(wecomErrorTable.rules().filter((rule) => rule.kind === 'FAILED').every((rule) => rule.owner)).toBe(true);
});
