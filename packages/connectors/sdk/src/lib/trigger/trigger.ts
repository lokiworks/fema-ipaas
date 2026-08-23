import * as z from "zod/mini";
import { OnStartContext, TestOrRunHookContext, TriggerHookContext } from '../context';
import type { OutputSchema } from '../output-schema';
import { ActionClassification, AiMetadata, PropertyGroup, TriggerBase } from '../connector-metadata';
import { InputPropertyMap } from '../property';
import { ExtractConnectorAuthPropertyTypeForMethods, ConnectorAuthProperty } from '../property/authentication';
import { isNil } from '@fema-ipaas/core-utils';
import { TriggerStrategy, TriggerTestStrategy, WebhookHandshakeConfiguration, WebhookHandshakeStrategy } from '@fema-ipaas/connector-types';
export { TriggerStrategy }

export const DEDUPE_KEY_PROPERTY = '_dedupe_key'



export enum WebhookRenewStrategy {
  CRON = 'CRON',
  NONE = 'NONE',
}

type OnStartRunner<ConnectorAuth extends ConnectorAuthProperty | undefined, TriggerProps extends InputPropertyMap> = (ctx: OnStartContext<ConnectorAuth, TriggerProps>) => Promise<unknown | void>



export const WebhookRenewConfiguration = z.union([
  z.object({
    strategy: z.literal(WebhookRenewStrategy.CRON),
    cronExpression: z.string(),
  }),
  z.object({
    strategy: z.literal(WebhookRenewStrategy.NONE),
  }),
])
export type WebhookRenewConfiguration = z.infer<typeof WebhookRenewConfiguration>

export interface WebhookResponse {
  status: number,
  body?: unknown,
  headers?: Record<string, string>
}

type BaseTriggerParams<
  ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined,
  TriggerProps extends InputPropertyMap,
  TS extends TriggerStrategy,
> = {
  name: string
  displayName: string
  description: string
  requireAuth?: boolean
  auth?: ConnectorAuth
  props: TriggerProps
  propertyGroups?: PropertyGroup[]
  type: TS
  onEnable: (context: TriggerHookContext<ExtractConnectorAuthPropertyTypeForMethods<ConnectorAuth>, TriggerProps, TS>) => Promise<void>
  onDisable: (context: TriggerHookContext<ExtractConnectorAuthPropertyTypeForMethods<ConnectorAuth>, TriggerProps, TS>) => Promise<void>
  run: (context: TestOrRunHookContext<ExtractConnectorAuthPropertyTypeForMethods<ConnectorAuth>, TriggerProps, TS>) => Promise<unknown[]>
  test?: (context: TestOrRunHookContext<ExtractConnectorAuthPropertyTypeForMethods<ConnectorAuth>, TriggerProps, TS>) => Promise<unknown[]>,
  onStart?: OnStartRunner<ExtractConnectorAuthPropertyTypeForMethods<ConnectorAuth>, TriggerProps>,
  sampleData: unknown
  outputSchema?: OutputSchema
  aiMetadata?: AiMetadata
  classification?: ActionClassification
}

type WebhookTriggerParams<
ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined,
TriggerProps extends InputPropertyMap,
TS extends TriggerStrategy,
> = BaseTriggerParams<ConnectorAuth, TriggerProps, TS> & {
  handshakeConfiguration?: WebhookHandshakeConfiguration
  onHandshake?: (context: TriggerHookContext<ExtractConnectorAuthPropertyTypeForMethods<ConnectorAuth>, TriggerProps, TS>) => Promise<WebhookResponse>,
  renewConfiguration?: WebhookRenewConfiguration
  onRenew?(context: TriggerHookContext<ExtractConnectorAuthPropertyTypeForMethods<ConnectorAuth>, TriggerProps, TS>): Promise<void>,
}

type CreateTriggerParams<
  ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined,
  TriggerProps extends InputPropertyMap,
  TS extends TriggerStrategy,
> = TS extends TriggerStrategy.WEBHOOK
    ? WebhookTriggerParams<ConnectorAuth, TriggerProps, TS>
    : BaseTriggerParams<ConnectorAuth, TriggerProps, TS>

export class ITrigger<
  TS extends TriggerStrategy,
  ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined,
  TriggerProps extends InputPropertyMap,
> implements TriggerBase {
  constructor(
    public readonly name: string,
    public readonly displayName: string,
    public readonly description: string,
    public readonly requireAuth: boolean,
    public readonly props: TriggerProps,
    public readonly type: TS,
    public readonly handshakeConfiguration: WebhookHandshakeConfiguration,
    public readonly onHandshake: (ctx: TriggerHookContext<ExtractConnectorAuthPropertyTypeForMethods<ConnectorAuth>, TriggerProps, TS>) => Promise<WebhookResponse>,
    public readonly renewConfiguration: WebhookRenewConfiguration,
    public readonly onRenew: (ctx: TriggerHookContext<ExtractConnectorAuthPropertyTypeForMethods<ConnectorAuth>, TriggerProps, TS>) => Promise<void>,
    public readonly onEnable: (ctx: TriggerHookContext<ExtractConnectorAuthPropertyTypeForMethods<ConnectorAuth>, TriggerProps, TS>) => Promise<void>,
    public readonly onDisable: (ctx: TriggerHookContext<ExtractConnectorAuthPropertyTypeForMethods<ConnectorAuth>, TriggerProps, TS>) => Promise<void>,
    public readonly onStart: OnStartRunner<ExtractConnectorAuthPropertyTypeForMethods<ConnectorAuth>, TriggerProps>,
    public readonly run: (ctx: TestOrRunHookContext<ExtractConnectorAuthPropertyTypeForMethods<ConnectorAuth>, TriggerProps, TS>) => Promise<unknown[]>,
    public readonly test: (ctx: TestOrRunHookContext<ExtractConnectorAuthPropertyTypeForMethods<ConnectorAuth>, TriggerProps, TS>) => Promise<unknown[]>,
    public readonly sampleData: unknown,
    public readonly testStrategy: TriggerTestStrategy,
    public readonly outputSchema?: OutputSchema,
    public readonly aiMetadata?: AiMetadata,
    public readonly classification?: ActionClassification,
    public readonly propertyGroups?: PropertyGroup[],
  ) { }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Trigger<
  ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined = any,
  TriggerProps extends InputPropertyMap = any,
  S extends TriggerStrategy = any,
> = ITrigger<S, ConnectorAuth, TriggerProps>

// TODO refactor and extract common logic
export const createTrigger = <
  TS extends TriggerStrategy,
  ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined ,
  TriggerProps extends InputPropertyMap,
>(params: CreateTriggerParams<ConnectorAuth, TriggerProps, TS>) => {
  switch (params.type) {
    case TriggerStrategy.WEBHOOK:
      return new ITrigger(
        params.name,
        params.displayName,
        params.description,
        params.requireAuth ?? true,
        params.props,
        params.type,
        params.handshakeConfiguration ?? { strategy: WebhookHandshakeStrategy.NONE },
        params.onHandshake ?? (async () => ({ status: 200 })),
        params.renewConfiguration ?? { strategy: WebhookRenewStrategy.NONE },
        params.onRenew ?? (async () => Promise.resolve()),
        params.onEnable,
        params.onDisable,
        params.onStart ?? (async () => Promise.resolve()),
        params.run,
        params.test ?? (() => Promise.resolve([params.sampleData])),
        params.sampleData,
        params.test ? TriggerTestStrategy.TEST_FUNCTION : TriggerTestStrategy.SIMULATION,
        params.outputSchema,
        params.aiMetadata,
        params.classification,
        params.propertyGroups,
      )
    case TriggerStrategy.POLLING:
      return new ITrigger(
        params.name,
        params.displayName,
        params.description,
        params.requireAuth ?? true,
        params.props,
        params.type,
        { strategy: WebhookHandshakeStrategy.NONE },
        async () => ({ status: 200 }),
        { strategy: WebhookRenewStrategy.NONE },
        (async () => Promise.resolve()),
        params.onEnable,
        params.onDisable,
        params.onStart ?? (async () => Promise.resolve()),
        params.run,
        params.test ?? (() => Promise.resolve([params.sampleData])),
        params.sampleData,
        TriggerTestStrategy.TEST_FUNCTION,
        params.outputSchema,
        params.aiMetadata,
        params.classification,
        params.propertyGroups,
      )
    case TriggerStrategy.MANUAL:
      return new ITrigger(
        params.name,
        params.displayName,
        params.description,
        params.requireAuth ?? true,
        params.props,
        params.type,
        { strategy: WebhookHandshakeStrategy.NONE },
        async () => ({ status: 200 }),
        { strategy: WebhookRenewStrategy.NONE },
        (async () => Promise.resolve()),
        params.onEnable,
        params.onDisable,
        params.onStart ?? (async () => Promise.resolve()),
        params.run,
        params.test ?? (() => Promise.resolve([params.sampleData])),
        params.sampleData,
        TriggerTestStrategy.TEST_FUNCTION,
        params.outputSchema,
        params.aiMetadata,
        params.classification,
        params.propertyGroups,
      )
    case TriggerStrategy.APP_WEBHOOK:
      return new ITrigger(
        params.name,
        params.displayName,
        params.description,
        params.requireAuth ?? true,
        params.props,
        params.type,
        { strategy: WebhookHandshakeStrategy.NONE },
        async () => ({ status: 200 }),
        { strategy: WebhookRenewStrategy.NONE },
        (async () => Promise.resolve()),
        params.onEnable,
        params.onDisable,
        params.onStart ?? (async () => Promise.resolve()),
        params.run,
        params.test ?? (() => Promise.resolve([params.sampleData])),
        params.sampleData,
        (isNil(params.sampleData) && isNil(params.test)) ? TriggerTestStrategy.SIMULATION : TriggerTestStrategy.TEST_FUNCTION,
        params.outputSchema,
        params.aiMetadata,
        params.classification,
        params.propertyGroups,
      )
  }
}
