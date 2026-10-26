import { describe, expect, it } from 'vitest';
import { ActionBase, ActionReliability, connectorContract, createAction, Property } from '../src';

function violations(action: ActionBase): string[] {
  return connectorContract.violationsOf({ connector: { actions: () => ({ [action.name]: action }) } });
}

function writeAction(reliability?: ActionReliability): ActionBase {
  return createAction({
    name: 'write', displayName: 'Write', description: 'Write', requireAuth: false,
    classification: 'WRITE', aiMetadata: { idempotent: reliability?.writeSafety !== 'UNSAFE' },
    props: { email: Property.ShortText({ displayName: 'Email', required: false }) },
    reliability, run: async () => undefined,
  });
}

describe('connector reliability contract', () => {
  it('keeps reliability in both the class and serialized schema', () => {
    const action = writeAction({ writeSafety: 'IDEMPOTENT' });
    expect(ActionBase.parse(action).reliability).toEqual({ writeSafety: 'IDEMPOTENT' });
    expect(violations(action)).toEqual([]);
  });

  it.each(['WRITE', 'DESTRUCTIVE'])('requires write safety for %s', (classification) => {
    expect(violations({ ...writeAction(), classification: classification === 'WRITE' ? 'WRITE' : 'DESTRUCTIVE' })).toContain('write: mutations must declare writeSafety');
  });

  it('requires lookup keys that actually exist', () => {
    expect(violations(writeAction({ writeSafety: 'LOOKUP_BEFORE_WRITE' }))).toContain('write: LOOKUP_BEFORE_WRITE must declare lookupKeys');
    expect(violations(writeAction({ writeSafety: 'LOOKUP_BEFORE_WRITE', lookupKeys: ['mobile'] }))).toContain('write: lookupKeys references missing property mobile');
    expect(violations(writeAction({ writeSafety: 'LOOKUP_BEFORE_WRITE', lookupKeys: ['email'] }))).toEqual([]);
  });

  it('requires readback to point to a local READ action', () => {
    expect(violations(writeAction({ writeSafety: 'IDEMPOTENT', readBack: { actionName: 'write', aspects: ['status'] } }))).toContain('write: readBack must reference a READ action in the same connector');
  });

  it('requires usable rate limits on authenticated actions', () => {
    expect(violations({ ...writeAction({ writeSafety: 'UNSAFE' }), requireAuth: true })).toContain('write: authenticated actions must declare rateLimits');
    expect(ActionReliability.safeParse({ rateLimits: [{ bucket: '', scope: 'APP', perSecond: 0 }] }).success).toBe(false);
    expect(violations(writeAction({ writeSafety: 'UNSAFE', rateLimits: [{ bucket: 'api', scope: 'APP', perSecond: 1 }, { bucket: 'api', scope: 'APP', perSecond: 2 }] }))).toContain('write: rate limit buckets must be unique');
  });

  it('requires AI retry metadata to agree with the contract', () => {
    expect(violations({ ...writeAction({ writeSafety: 'UNSAFE' }), aiMetadata: { idempotent: true } })).toContain('write: aiMetadata.idempotent must agree with writeSafety');
  });

  it('checks the pagination properties, schema and returned business keys', () => {
    const invalid = writeAction({ writeSafety: 'UNSAFE', enumeration: { entity: 'ACCOUNT', businessKeyPath: 'user.id' } });
    expect(violations(invalid)).toEqual(expect.arrayContaining([
      'write: enumeration must be SEARCH', 'write: enumeration requires optional text pageToken',
      'write: enumeration requires numeric pageSize', 'write: enumeration outputSchema requires items and nextPageToken',
    ]));
    const valid: ActionBase = {
      ...invalid, classification: 'SEARCH', reliability: { enumeration: { entity: 'ACCOUNT', businessKeyPath: 'user.id' } },
      props: { pageToken: Property.ShortText({ displayName: 'Page', required: false }), pageSize: Property.Number({ displayName: 'Size', required: true }) },
      outputSchema: { fields: [{ key: 'items', listItems: [{ key: 'user' }] }, { key: 'nextPageToken' }] },
    };
    expect(violations(valid)).toEqual([]);
    expect(connectorContract.pageViolationsOf({ action: valid, output: { items: [{ user: { id: '1' } }], nextPageToken: null } })).toEqual([]);
    expect(connectorContract.pageViolationsOf({ action: valid, output: { items: [{}], nextPageToken: null } })).toHaveLength(1);
    expect(connectorContract.pageViolationsOf({ action: valid, output: [] })).toHaveLength(1);
  });

  it('requires a real property for a bounded dedupe window', () => {
    expect(violations(writeAction({ writeSafety: 'UNSAFE', dedupeWindowSeconds: 3600 }))).toContain('write: dedupeWindowSeconds requires dedupeKeyProp');
    expect(violations(writeAction({ writeSafety: 'UNSAFE', dedupeKeyProp: 'missing' }))).toContain('write: dedupeKeyProp references a missing property');
  });
});
