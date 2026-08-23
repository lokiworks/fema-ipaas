import * as z from "zod/mini";
import { TPropertyValue } from '../input/common';
import { PropertyType } from '../input/property-type';
import { LongTextProperty, ShortTextProperty } from '../input/text-property';
import { NumberProperty } from '../input/number-property';
import { CheckboxProperty } from '../input/checkbox-property';
import { StaticDropdownProperty, StaticMultiSelectDropdownProperty } from '../input/dropdown/static-dropdown';
import { StaticPropsValue } from '..';
import { SecretTextProperty } from './secret-text-property';
import { BaseConnectorAuthSchema } from './common';
import { MarkDownProperty } from '../input/markdown-property';

const OIDCAuthProps = z.record(z.string(), z.union([
  ShortTextProperty,
  LongTextProperty,
  SecretTextProperty,
  NumberProperty,
  CheckboxProperty,
  StaticDropdownProperty,
  StaticMultiSelectDropdownProperty,
  MarkDownProperty,
]));

export type OIDCAuthProps = Record<
  string,
  | ShortTextProperty<boolean>
  | LongTextProperty<boolean>
  | SecretTextProperty<boolean>
  | NumberProperty<boolean>
  | StaticDropdownProperty<unknown, boolean>
  | CheckboxProperty<boolean>
  | MarkDownProperty
  | StaticMultiSelectDropdownProperty<unknown, boolean>
>;

export const OIDCProperty = z.object({
  ...BaseConnectorAuthSchema.shape,
  props: OIDCAuthProps,
  ...TPropertyValue(z.unknown(), PropertyType.OIDC).shape,
})

export type OIDCProperty<
  T extends OIDCAuthProps
> = BaseConnectorAuthSchema<StaticPropsValue<T>> & {
  props: T;
} &
  TPropertyValue<
    StaticPropsValue<T>,
    PropertyType.OIDC,
    true
  >;
