import { BasePropertySchema, TPropertyValue } from "../common";
import { DropdownState } from "./common";
import { ConnectionValueForAuthProperty, PropertyContext } from "../../../context";
import * as z from "zod/mini";
import { PropertyType } from "../property-type";
import { ConnectorAuthProperty } from "../../authentication";

type DynamicDropdownOptions<T, ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] |  undefined = undefined> = (
  propsValue: Record<string, unknown> & {
    auth?: ConnectorAuth extends undefined ? undefined : ConnectionValueForAuthProperty<Exclude<ConnectorAuth, undefined>>;
  },
  ctx: PropertyContext,
) => Promise<DropdownState<T>>;

export const DropdownProperty = z.object({
  ...BasePropertySchema.shape,
  ...TPropertyValue(z.unknown(), PropertyType.DROPDOWN).shape,
  refreshers: z.array(z.string()),
});

export type DropdownProperty<T, R extends boolean, ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] |  undefined = undefined> = BasePropertySchema & {
  /**
   * A dummy property used to infer {@code ConnectorAuth} type
   */
  auth: ConnectorAuth;
  refreshers: string[];
  refreshOnSearch?: boolean;
  options: DynamicDropdownOptions<T, ConnectorAuth>;
} & TPropertyValue<T, PropertyType.DROPDOWN, R>;


export const MultiSelectDropdownProperty = z.object({
  ...BasePropertySchema.shape,
  ...TPropertyValue(z.array(z.unknown()), PropertyType.MULTI_SELECT_DROPDOWN).shape,
  refreshers: z.array(z.string()),
});

export type MultiSelectDropdownProperty<
  T,
  R extends boolean,
  ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined = undefined
> = BasePropertySchema & {
  /**
   * A dummy property used to infer {@code ConnectorAuth} type
   */
  auth: ConnectorAuth;
  refreshers: string[];
  refreshOnSearch?: boolean;
  options: DynamicDropdownOptions<T, ConnectorAuth>;
} & TPropertyValue<
  T[],
  PropertyType.MULTI_SELECT_DROPDOWN,
  R
>;
