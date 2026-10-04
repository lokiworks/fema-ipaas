import { PropertyType } from '@fema-ipaas/connector-sdk';
import {
  MappingFieldType,
  MappingTarget,
  MappingTargetField,
} from '@fema-ipaas/core-utils';

function fromAction({
  connectorName,
  actionName,
  displayName,
  props,
}: {
  connectorName: string;
  actionName: string;
  displayName: string;
  props: Record<string, ActionProp>;
}): MappingTarget {
  return {
    connectorName,
    actionName,
    displayName,
    fields: Object.entries(props).flatMap(([name, prop]) => {
      const field = fieldOf({ name, prop });
      return field === null ? [] : [field];
    }),
  };
}

function fieldOf({
  name,
  prop,
}: {
  name: string;
  prop: ActionProp;
}): MappingTargetField | null {
  if (name === AUTH_PROPERTY || SKIPPED_TYPES.includes(prop.type)) {
    return null;
  }
  const options = optionValues(prop);
  const type = typeOf({ prop, options });
  return {
    name,
    label: prop.displayName,
    type,
    required: prop.required,
    ...(options.length > 0 && type !== MappingFieldType.ARRAY
      ? { options }
      : {}),
  };
}

function typeOf({
  prop,
  options,
}: {
  prop: ActionProp;
  options: (string | number)[];
}): MappingFieldType {
  switch (prop.type) {
    case PropertyType.NUMBER:
      return MappingFieldType.NUMBER;
    case PropertyType.CHECKBOX:
      return MappingFieldType.BOOLEAN;
    case PropertyType.DATE_TIME:
      return MappingFieldType.DATE;
    case PropertyType.ARRAY:
    case PropertyType.MULTI_SELECT_DROPDOWN:
    case PropertyType.STATIC_MULTI_SELECT_DROPDOWN:
      return MappingFieldType.ARRAY;
    case PropertyType.OBJECT:
      return MappingFieldType.OBJECT;
    case PropertyType.STATIC_DROPDOWN:
      return options.length > 0 &&
        options.every((value) => typeof value === 'number')
        ? MappingFieldType.NUMBER
        : options.length > 0
        ? MappingFieldType.STRING
        : MappingFieldType.ANY;
    case PropertyType.SHORT_TEXT:
    case PropertyType.LONG_TEXT:
    case PropertyType.RICH_TEXT:
      return MappingFieldType.STRING;
    default:
      return MappingFieldType.ANY;
  }
}

function optionValues(prop: ActionProp): (string | number)[] {
  if (prop.type !== PropertyType.STATIC_DROPDOWN) {
    return [];
  }
  const values = (prop.options?.options ?? []).map((option) => option.value);
  return values.every(
    (value): value is string | number =>
      typeof value === 'string' || typeof value === 'number',
  )
    ? values
    : [];
}

const AUTH_PROPERTY = 'auth';
const SKIPPED_TYPES: PropertyType[] = [
  PropertyType.MARKDOWN,
  PropertyType.DYNAMIC,
  PropertyType.FILE,
  PropertyType.CUSTOM,
  PropertyType.COLOR,
  PropertyType.OAUTH2,
  PropertyType.SECRET_TEXT,
  PropertyType.BASIC_AUTH,
  PropertyType.CUSTOM_AUTH,
  PropertyType.OIDC,
  PropertyType.DATE_RANGE,
];

export const targetSchema = {
  fromAction,
};

export type ActionProp = {
  displayName: string;
  required: boolean;
  type: PropertyType;
  options?: { options: { label: string; value: unknown }[] };
};

export type TargetOption = {
  key: string;
  label: string;
  target: MappingTarget;
};
