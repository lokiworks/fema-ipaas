import { describe, expect, it } from 'vitest';
import { Property } from '../src/lib/property';
import { connectorPropertiesUtils } from '../src/lib/property/util';

describe('buildSchema for array properties', () => {
  const optionalArray = Property.Array({ displayName: 'Values', required: false });
  const requiredArray = Property.Array({ displayName: 'Values', required: true });

  it('accepts a missing optional array', () => {
    const schema = connectorPropertiesUtils.buildSchema({ values: optionalArray }, undefined);
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ values: [] }).success).toBe(true);
    expect(schema.safeParse({ values: ['1'] }).success).toBe(true);
  });

  it('still rejects a missing or empty required array', () => {
    const schema = connectorPropertiesUtils.buildSchema({ values: requiredArray }, undefined);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ values: [] }).success).toBe(false);
    expect(schema.safeParse({ values: ['1'] }).success).toBe(true);
  });

  it('still checks the items of a provided optional array', () => {
    const schema = connectorPropertiesUtils.buildSchema({ values: optionalArray }, undefined);
    expect(schema.safeParse({ values: [1] }).success).toBe(false);
  });
});
