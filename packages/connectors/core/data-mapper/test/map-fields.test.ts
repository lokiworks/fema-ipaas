/// <reference types="vitest/globals" />

import {
  createMockActionContext,
  MappingTransformType,
} from '@fema-ipaas/connector-sdk';

import { mapFields } from '../src/lib/actions/map-fields';

describe('mapFields', () => {
  test('builds the target object without lookups', async () => {
    const ctx = createMockActionContext({
      propsValue: {
        mapping: {
          fields: [
            {
              id: '1',
              target: 'LastName',
              source: ' 王磊 ',
              transforms: [{ type: MappingTransformType.TRIM }],
            },
            {
              id: '2',
              target: 'Amount',
              source: '1,280',
              transforms: [{ type: MappingTransformType.NUMBER }],
            },
          ],
        },
        failOnError: true,
      },
    });
    const result = await mapFields.run(ctx);
    expect(result).toEqual({ LastName: '王磊', Amount: 1280 });
  });

  test('fails with the field name when a transform fails', async () => {
    const ctx = createMockActionContext({
      propsValue: {
        mapping: {
          fields: [
            {
              id: '1',
              target: 'Amount',
              source: 'abc',
              transforms: [{ type: MappingTransformType.NUMBER }],
            },
          ],
        },
        failOnError: true,
      },
    });
    await expect(mapFields.run(ctx)).rejects.toThrow('Amount');
  });

  test('keeps going when failures are allowed', async () => {
    const ctx = createMockActionContext({
      propsValue: {
        mapping: {
          fields: [
            {
              id: '1',
              target: 'Amount',
              source: 'abc',
              transforms: [{ type: MappingTransformType.NUMBER }],
            },
          ],
        },
        failOnError: false,
      },
    });
    const result = await mapFields.run(ctx);
    expect(result).toEqual({ Amount: 'abc' });
  });
});
