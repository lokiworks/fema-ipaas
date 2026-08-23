import * as z from "zod/mini";
import { StaticDropdownProperty, StaticMultiSelectDropdownProperty } from "./dropdown/static-dropdown";
import { ShortTextProperty } from "./text-property";
import { BasePropertySchema, TPropertyValue } from "./common";
import { ConnectionValueForAuthProperty, PropertyContext } from "../../context";
import { PropertyType } from "./property-type";
import { JsonProperty } from "./json-property";
import { ArrayProperty } from "./array-property";
import { ExtractConnectorAuthPropertyTypeForMethods, InputPropertyMap, ConnectorAuthProperty } from "..";

export const DynamicProp = z.union([
  ShortTextProperty,
  StaticDropdownProperty,
  JsonProperty,
  ArrayProperty,
  StaticMultiSelectDropdownProperty,
])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DynamicProp =
  | ShortTextProperty<boolean>
  | StaticDropdownProperty<any, boolean>
  | JsonProperty<boolean>
  | ArrayProperty<boolean>
  | StaticMultiSelectDropdownProperty<any, boolean>;

export const DynamicPropsValue = z.record(z.string(), DynamicProp);

export type DynamicPropsValue = Record<string, DynamicProp['valueSchema']>;

export const DynamicProperties = z.object({
  refreshers: z.array(z.string()),
  ...BasePropertySchema.shape,
  ...TPropertyValue(z.unknown(), PropertyType.DYNAMIC).shape,
})

export type DynamicProperties<R extends boolean, ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined = undefined> = BasePropertySchema &
{
   //dummy property to define auth property value inside props value
  auth: ConnectorAuth
  props: DynamicPropertiesOptions<ConnectorAuth>
  refreshers: string[];
} &
  TPropertyValue<
    DynamicPropsValue,
    PropertyType.DYNAMIC,
    R
  >;

  type DynamicPropertiesOptions<ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined = undefined> = (
    propsValue: Record<string, unknown> & {
      auth?: ConnectionValueForAuthProperty<ExtractConnectorAuthPropertyTypeForMethods<ConnectorAuth>>;
    },
    ctx: PropertyContext,
  ) => Promise<InputPropertyMap>;
