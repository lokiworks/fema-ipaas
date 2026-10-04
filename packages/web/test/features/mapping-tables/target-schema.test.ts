import { PropertyType } from '@fema-ipaas/connector-sdk';
import { MappingFieldType } from '@fema-ipaas/core-utils';
import { describe, expect, it } from 'vitest';

import { targetSchema } from '@/features/mapping-tables/utils/target-schema';

describe('targetSchema.fromAction', () => {
  const target = targetSchema.fromAction({
    connectorName: '@fema-ipaas/connector-feishu',
    actionName: 'provision_user',
    displayName: '开通员工账号',
    props: {
      auth: {
        displayName: 'Connection',
        required: true,
        type: PropertyType.CUSTOM_AUTH,
      },
      name: {
        displayName: '姓名',
        required: true,
        type: PropertyType.SHORT_TEXT,
      },
      employeeType: {
        displayName: '员工类型',
        required: true,
        type: PropertyType.STATIC_DROPDOWN,
        options: {
          options: [
            { label: '正式', value: 1 },
            { label: '实习', value: 2 },
          ],
        },
      },
      level: {
        displayName: '职级',
        required: false,
        type: PropertyType.NUMBER,
      },
      active: {
        displayName: '启用',
        required: false,
        type: PropertyType.CHECKBOX,
      },
      joined: {
        displayName: '入职日期',
        required: false,
        type: PropertyType.DATE_TIME,
      },
      note: {
        displayName: '说明',
        required: false,
        type: PropertyType.MARKDOWN,
      },
    },
  });

  it('drops auth and display-only props and keeps the order', () => {
    expect(target.fields.map((field) => field.name)).toEqual([
      'name',
      'employeeType',
      'level',
      'active',
      'joined',
    ]);
  });

  it('derives the field type, required flag and allowed options', () => {
    const byName = Object.fromEntries(
      target.fields.map((field) => [field.name, field]),
    );
    expect(byName['name']).toMatchObject({
      type: MappingFieldType.STRING,
      required: true,
      label: '姓名',
    });
    expect(byName['employeeType']).toMatchObject({
      type: MappingFieldType.NUMBER,
      options: [1, 2],
    });
    expect(byName['level']?.type).toBe(MappingFieldType.NUMBER);
    expect(byName['active']?.type).toBe(MappingFieldType.BOOLEAN);
    expect(byName['joined']?.type).toBe(MappingFieldType.DATE);
  });
});

describe('targetSchema.fromModelAction', () => {
  const model = {
    name: '@fema-ipaas/connector-feishu',
    displayName: '飞书',
    actions: {
      provision_user: {
        displayName: '开通员工账号',
        props: {
          auth: {
            displayName: 'Connection',
            required: true,
            type: PropertyType.CUSTOM_AUTH,
          },
          name: {
            displayName: '姓名',
            required: true,
            type: PropertyType.SHORT_TEXT,
          },
          employeeType: {
            displayName: '员工类型',
            required: true,
            type: PropertyType.STATIC_DROPDOWN,
            options: {
              options: [
                { label: '正式', value: 1 },
                { label: '实习', value: 2 },
              ],
            },
          },
        },
      },
    },
  };

  it('builds the destination from a connector model action', () => {
    const target = targetSchema.fromModelAction({
      model,
      actionName: 'provision_user',
    });
    expect(target).toMatchObject({
      connectorName: '@fema-ipaas/connector-feishu',
      actionName: 'provision_user',
      displayName: '飞书 · 开通员工账号',
    });
    expect(target?.fields.map((field) => field.name)).toEqual([
      'name',
      'employeeType',
    ]);
    expect(target?.fields[1]).toMatchObject({
      type: MappingFieldType.NUMBER,
      options: [1, 2],
      required: true,
    });
  });

  it('returns null for an action the connector does not have', () => {
    expect(
      targetSchema.fromModelAction({
        model,
        actionName: 'nope',
      }),
    ).toBeNull();
  });
});
