import * as z from "zod/mini";
import { ActionContext } from '../context';
import type { OutputSchema } from '../output-schema';
import { ActionBase, Audience, AiMetadata, ActionClassification, PropertyGroup } from '../connector-metadata';
import { InputPropertyMap } from '../property';
import { ExtractConnectorAuthPropertyTypeForMethods, ConnectorAuthProperty } from '../property/authentication';

export type ActionRunner<ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined = ConnectorAuthProperty, ActionProps extends InputPropertyMap = InputPropertyMap> =
  (ctx: ActionContext<ConnectorAuth, ActionProps>) => Promise<unknown | void>

export const ErrorHandlingOptionsParam = z.object({
  retryOnFailure: z.object({
    defaultValue: z.optional(z.boolean()),
    hide: z.optional(z.boolean()),
  }),
  continueOnFailure: z.object({
    defaultValue: z.optional(z.boolean()),
    hide: z.optional(z.boolean()),
  }),
})
export type ErrorHandlingOptionsParam = z.infer<typeof ErrorHandlingOptionsParam>

type CreateActionParams<ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined, ActionProps extends InputPropertyMap> = {
  /**
   * A dummy parameter used to infer {@code ConnectorAuth} type
   */
  name: string
  /**
   * this parameter is used to infer the type of the connector auth value in run and test methods
   */
  auth?: ConnectorAuth
  displayName: string
  description: string
  props: ActionProps
  propertyGroups?: PropertyGroup[]
  run: ActionRunner<ExtractConnectorAuthPropertyTypeForMethods<ConnectorAuth>, ActionProps>
  test?: ActionRunner<ExtractConnectorAuthPropertyTypeForMethods<ConnectorAuth>, ActionProps>
  requireAuth?: boolean
  errorHandlingOptions?: ErrorHandlingOptionsParam
  outputSchema?: OutputSchema
  audience?: Audience
  aiMetadata?: AiMetadata
  classification?: ActionClassification
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class IAction<ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined = any, ActionProps extends InputPropertyMap = InputPropertyMap> implements ActionBase {
  constructor(
    public readonly name: string,
    public readonly displayName: string,
    public readonly description: string,
    public readonly props: ActionProps,
    public readonly propertyGroups: PropertyGroup[] | undefined,
    public readonly run: ActionRunner<ExtractConnectorAuthPropertyTypeForMethods<ConnectorAuth>, ActionProps>,
    public readonly test: ActionRunner<ExtractConnectorAuthPropertyTypeForMethods<ConnectorAuth>, ActionProps>,
    public readonly requireAuth: boolean,
    public readonly errorHandlingOptions: ErrorHandlingOptionsParam,
    public readonly outputSchema?: OutputSchema,
    public readonly audience?: Audience,
    public readonly aiMetadata?: AiMetadata,
    public readonly classification?: ActionClassification,
  ) { }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Action<
  ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined = any,
  ActionProps extends InputPropertyMap = any,
> = IAction<ConnectorAuth, ActionProps>

export const createAction = <
  ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined = ConnectorAuthProperty,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ActionProps extends InputPropertyMap = any
>(
  params: CreateActionParams<ConnectorAuth, ActionProps>,
) => {
  return new IAction(
    params.name,
    params.displayName,
    params.description,
    params.props,
    params.propertyGroups,
    params.run,
    params.test ?? params.run,
    params.requireAuth ?? true,
    params.errorHandlingOptions ?? {
      continueOnFailure: {
        defaultValue: false,
      },
      retryOnFailure: {
        defaultValue: false,
      }
    },
    params.outputSchema,
    params.audience,
    params.aiMetadata,
    params.classification,
  )
}
