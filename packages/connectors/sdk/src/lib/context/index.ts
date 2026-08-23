import {
  ConnectionType,
  ConnectionValue,
  ExecutionType,
  RespondResponse,
  ResumePayload,
  TriggerPayload,
  TriggerStrategy,
  DelayPauseMetadata,
  PauseMetadata,
  WebhookPauseMetadata,
} from '@fema/connector-types';
import type { SeekPage } from '@fema/core-utils';
import type { FlowRunId, ProjectId } from '@fema/core-utils';
import type { Readable } from 'node:stream'

import {
  BasicAuthProperty,
  CustomAuthProperty,
  InputPropertyMap,
  OIDCProperty,
  OAuth2Property,
  SecretTextProperty,
  StaticPropsValue,
} from '../property';
import { ConnectorAuthProperty } from '../property/authentication';
import type { PopulatedFlowSummary } from '@fema/connector-types';

export type BaseContext<
  ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined,
  Props extends InputPropertyMap
> = {
  flows: FlowsContext;
  step: StepContext;
    auth: ConnectionValueForAuthProperty<ConnectorAuth>;
  propsValue: StaticPropsValue<Props>;
  store: Store;
  project: {
    id: ProjectId;
    externalId: () => Promise<string | undefined>;
  };
  connections: ConnectionsManager;
};


type ExtractCustomAuthProps<T> = T extends CustomAuthProperty<infer Props> ? Props : never;

type ExtractOIDCProps<T> = T extends OIDCProperty<infer Props> ? Props : never;

type ExtractOAuth2Props<T> = T extends OAuth2Property<infer Props> ? Props : never;


export type ConnectionValueForAuthProperty<T extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined> = 
  T extends ConnectorAuthProperty[] ? ConnectionValueForSingleAuthProperty<T[number]> :
  T extends ConnectorAuthProperty ? ConnectionValueForSingleAuthProperty<T> :
  T extends undefined ? undefined : never;

type ConnectionValueForSingleAuthProperty<T extends ConnectorAuthProperty | undefined> =
  T extends SecretTextProperty<boolean> ? ConnectionValue<ConnectionType.SECRET_TEXT> :
  T extends BasicAuthProperty ? ConnectionValue<ConnectionType.BASIC_AUTH> :
  T extends CustomAuthProperty<any> ? ConnectionValue<ConnectionType.CUSTOM_AUTH, StaticPropsValue<ExtractCustomAuthProps<T>>> :
  T extends OIDCProperty<any> ? ConnectionValue<ConnectionType.OIDC, StaticPropsValue<ExtractOIDCProps<T>>> :
  T extends OAuth2Property<any> ? ConnectionValue<ConnectionType.OAUTH2, StaticPropsValue<ExtractOAuth2Props<T>>> :
  T extends undefined ? undefined : never;
type AppWebhookTriggerHookContext<
  ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined,
  TriggerProps extends InputPropertyMap
> = BaseContext<ConnectorAuth, TriggerProps> & {
  webhookUrl: string;
  payload: TriggerPayload;
  app: {
    createListeners({
      events,
      identifierValue,
    }: {
      events: string[];
      identifierValue: string;
    }): void;
  };
};

type PollingTriggerHookContext<
  ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined,
  TriggerProps extends InputPropertyMap
> = BaseContext<ConnectorAuth, TriggerProps> & {
  server: ServerContext;
  setSchedule(schedule: SetScheduleRequest): void;
  isRepublish?: boolean;
};

type WebhookTriggerHookContext<
  ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined,
  TriggerProps extends InputPropertyMap,
> = BaseContext<ConnectorAuth, TriggerProps> & {
  webhookUrl: string;
  payload: TriggerPayload;
  server: ServerContext;
};
export type TriggerHookContext<
  ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined,
  TriggerProps extends InputPropertyMap,
  S extends TriggerStrategy,
> = S extends TriggerStrategy.APP_WEBHOOK
  ? AppWebhookTriggerHookContext<ConnectorAuth, TriggerProps>
  : S extends TriggerStrategy.POLLING
  ? PollingTriggerHookContext<ConnectorAuth, TriggerProps>
  : S extends TriggerStrategy.WEBHOOK
  ? WebhookTriggerHookContext<ConnectorAuth, TriggerProps> & {
    server: ServerContext;
  }
  : never;

export type TestOrRunHookContext<
  ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined,
  TriggerProps extends InputPropertyMap,
  S extends TriggerStrategy
> = TriggerHookContext<ConnectorAuth, TriggerProps, S> & {
  files: FilesService;
};

export type StopHookParams = {
  response: RespondResponse;
};

export type RespondHookParams = {
  response: RespondResponse;
};

export type StopHook = (params?: StopHookParams) => void;

export type RespondHook = (params?: RespondHookParams) => void;

/** @deprecated Since 2026-04-12. Use {@link CreateWaitpointHook} and {@link WaitForWaitpointHook} instead. */
export type PauseHookParams = {
  pauseMetadata: PauseMetadata;
};

/** @deprecated Since 2026-04-12. Use {@link CreateWaitpointHook} and {@link WaitForWaitpointHook} instead. */
export type PauseHook = (params: {
  pauseMetadata: Omit<DelayPauseMetadata, 'requestIdToReply'> | Omit<WebhookPauseMetadata, 'requestId' | 'requestIdToReply'>
}) => void;

export type FlowsContext = {
  list(params?: ListFlowsContextParams): Promise<SeekPage<PopulatedFlowSummary>>
  current: {
    id: string;
    version: {
      id: string;
    };
  };
}

export type StepContext = {
  name: string;
}

export type ListFlowsContextParams = {
  externalIds?: string[]
}


export type PropertyContext = {
  server: ServerContext;
  project: {
    id: ProjectId;
    externalId: () => Promise<string | undefined>;
  };
  searchValue?: string;
  flows: FlowsContext;
  connections: ConnectionsManager;
};

export type ServerContext = {
  apiUrl: string;
  publicUrl: string;
  token: string;
};

export type CreateWaitpointParams = {
  type: 'DELAY' | 'WEBHOOK';
  version?: 'V0' | 'V1';
  resumeDateTime?: string;
  responseToSend?: RespondResponse;
};

export type CreateWaitpointResult = {
  id: string;
  resumeUrl: string;
  buildResumeUrl: (params: { queryParams: Record<string, string>, sync?: boolean }) => string;
};

export type CreateWaitpointHook = (params: CreateWaitpointParams) => Promise<CreateWaitpointResult>;
export type WaitForWaitpointHook = (waitpointId: string) => void;

export type RunContext = {
  id: FlowRunId;
  stop: StopHook;
  /** @deprecated Use createWaitpoint + waitForWaitpoint instead */
  pause?: PauseHook;
  respond: RespondHook;
  createWaitpoint: CreateWaitpointHook;
  waitForWaitpoint: WaitForWaitpointHook;
}

export type OnStartContext<
  ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined,
  TriggerProps extends InputPropertyMap
> = Omit<BaseContext<ConnectorAuth, TriggerProps>, 'flows'> & {
  run: Pick<RunContext, 'id'>;
  payload: unknown;
}


export type OutputContext = {
  update: (params: {
    data: {
      [key: string]: unknown;
    };
  }) => Promise<void>;
}

type BaseActionContext<
  ET extends ExecutionType,
  ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined,
  ActionProps extends InputPropertyMap
> = BaseContext<ConnectorAuth, ActionProps> & {
  executionType: ET;
  tags: TagsManager;
  server: ServerContext;
  files: FilesService;
  output: OutputContext;
  run: RunContext;
  /** @deprecated Use waitpoint.buildResumeUrl() from createWaitpoint result instead */
  generateResumeUrl?: (params: {
    queryParams: Record<string, string>,
    sync?: boolean
  }) => string;
};

type BeginExecutionActionContext<
  ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined = undefined,
  ActionProps extends InputPropertyMap = InputPropertyMap
> = BaseActionContext<ExecutionType.BEGIN, ConnectorAuth, ActionProps>;

type ResumeExecutionActionContext<
  ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined = undefined,
  ActionProps extends InputPropertyMap = InputPropertyMap
> = BaseActionContext<ExecutionType.RESUME, ConnectorAuth, ActionProps> & {
  resumePayload: ResumePayload;
};

export type ActionContext<
  ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined = undefined,
  ActionProps extends InputPropertyMap = InputPropertyMap
> =
  | BeginExecutionActionContext<ConnectorAuth, ActionProps>
  | ResumeExecutionActionContext<ConnectorAuth, ActionProps>;




export interface FilesService {
  write({
    fileName,
    data,
  }: {
    fileName: string;
    data: Buffer | Readable;
  }): Promise<string>;
}

export interface ConnectionsManager {
  get(
    key: string
  ): Promise<ConnectionValue | Record<string, unknown> | string | null>;
}

export interface TagsManager {
  add(params: { name: string }): Promise<void>;
}

export interface Store {
  put<T>(key: string, value: T, scope?: StoreScope): Promise<T>;
  get<T>(key: string, scope?: StoreScope): Promise<T | null>;
  delete(key: string, scope?: StoreScope): Promise<void>;
}

export enum StoreScope {
  // Collection were deprecated in favor of project
  PROJECT = 'COLLECTION',
  FLOW = 'FLOW',
}

export type SetScheduleRequest =
  | { cronExpression: string; timezone?: string }
  | { intervalMs: number };