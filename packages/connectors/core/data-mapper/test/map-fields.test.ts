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

  test('reports a required target field that has no source in plain words', async () => {
    const ctx = createMockActionContext({
      propsValue: {
        mapping: {
          fields: [
            { id: '1', target: 'name', source: '张三', transforms: [] },
          ],
          destination: {
            connectorName: '@fema-ipaas/connector-feishu',
            actionName: 'provision_user',
            fields: [
              { name: 'name', type: 'STRING', required: true },
              {
                name: 'mobile',
                label: 'Mobile',
                type: 'STRING',
                required: true,
              },
            ],
          },
        },
        failOnError: true,
      },
    });
    await expect(mapFields.run(ctx)).rejects.toThrow(
      '必填字段「Mobile」还没有映射来源',
    );
  });

  test('rejects a text value for a number field instead of passing it on', async () => {
    const ctx = createMockActionContext({
      propsValue: {
        mapping: {
          fields: [{ id: '1', target: 'employeeType', source: '1', transforms: [] }],
          destination: {
            connectorName: '@fema-ipaas/connector-feishu',
            actionName: 'provision_user',
            fields: [{ name: 'employeeType', type: 'NUMBER', required: true }],
          },
        },
        failOnError: true,
      },
    });
    await expect(mapFields.run(ctx)).rejects.toThrow('需要数字');
  });

  test('names the field, the value and the table when a lookup misses', async () => {
    const ctx = createMockActionContext({
      propsValue: {
        mapping: {
          fields: [
            {
              id: '1',
              target: 'departmentId',
              source: '20399',
              transforms: [{ type: MappingTransformType.LOOKUP, arg: 'mt_gone' }],
            },
          ],
        },
        failOnError: true,
      },
    });
    await expect(mapFields.run(ctx)).rejects.toThrow(
      '字段「departmentId」：映射表不存在或已被删除',
    );
  });
});
