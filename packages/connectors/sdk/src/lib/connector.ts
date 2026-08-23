import { Trigger } from './trigger/trigger';
import { Action } from './action/action';
import {
  EventPayload,
  ParseEventResponse,
  ConnectorCategory,
} from '@fema/connector-types';
import { ConnectorBase, ConnectorMetadata} from './connector-metadata';
import { ConnectorAuthProperty } from './property/authentication';
import { ServerContext } from './context';
import { ContextVersion, LATEST_CONTEXT_VERSION, MINIMUM_SUPPORTED_RELEASE_AFTER_LATEST_CONTEXT_VERSION } from './context/versioning';



export class Connector<ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined = ConnectorAuthProperty>
  implements Omit<ConnectorBase, 'version' | 'name'>
{
  private readonly _actions: Record<string, Action> = {};
  private readonly _triggers: Record<string, Trigger> = {};
  // this method didn't exist in older version
  public getContextInfo: (() => { version: ContextVersion } )| undefined = () => ({ version: LATEST_CONTEXT_VERSION });
  constructor(
    public readonly displayName: string,
    public readonly logoUrl: string,
    public readonly authors: string[],
    public readonly events: ConnectorEventProcessors | undefined,
    actions: Action[],
    triggers: Trigger[],
    public readonly categories: ConnectorCategory[],
    public readonly auth?: ConnectorAuth,
    public readonly minimumSupportedRelease: string = MINIMUM_SUPPORTED_RELEASE_AFTER_LATEST_CONTEXT_VERSION,
    public readonly maximumSupportedRelease?: string,
    public readonly description = '',
    public readonly deprecated?: boolean,
  ) {
    if (!isValidSimpleSemver(minimumSupportedRelease) || isSemverLessThan(minimumSupportedRelease, MINIMUM_SUPPORTED_RELEASE_AFTER_LATEST_CONTEXT_VERSION)) {
      this.minimumSupportedRelease = MINIMUM_SUPPORTED_RELEASE_AFTER_LATEST_CONTEXT_VERSION;
    }
    actions.forEach((action) => (this._actions[action.name] = action));
    triggers.forEach((trigger) => (this._triggers[trigger.name] = trigger));
  }


  metadata(): BackwardCompatibleConnectorMetadata {
    return {
      displayName: this.displayName,
      logoUrl: this.logoUrl,
      actions: this._actions,
      triggers: this._triggers,
      categories: this.categories,
      description: this.description,
      authors: this.authors,
      auth: withConnectionIdentifierFlag(this.auth),
      minimumSupportedRelease: this.minimumSupportedRelease,
      maximumSupportedRelease: this.maximumSupportedRelease,
      deprecated: this.deprecated,
      contextInfo: this.getContextInfo?.()
    };
  }

  getAction(actionName: string): Action | undefined {
    return this._actions[actionName];
  }

  getTrigger(triggerName: string): Trigger | undefined {
    return this._triggers[triggerName];
  }

  actions() {
    return this._actions;
  }

  triggers() {
    return this._triggers;
  }
}

export const createConnector = <ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined>(
  params: CreateConnectorParams<ConnectorAuth>
) => {
  if(params.auth && Array.isArray(params.auth)) { 
    const isUnique = params.auth.every((auth, index, self) =>
      index === self.findIndex((t) => t.type === auth.type)
    );
    if(!isUnique) {
     throw new Error('Auth properties must be unique by type');
    }
  }
  return new Connector<ConnectorAuth>(
    params.displayName,
    params.logoUrl,
    params.authors ?? [],
    params.events,
    params.actions,
    params.triggers,
    params.categories ?? [],
    params.auth,
    params.minimumSupportedRelease,
    params.maximumSupportedRelease,
    params.description,
    params.deprecated,
  );
};

type CreateConnectorParams<
  ConnectorAuth extends ConnectorAuthProperty | ConnectorAuthProperty[] | undefined = undefined
> = {
  displayName: string;
  logoUrl: string;
  authors: string[];
  description?: string;
  auth: ConnectorAuth | undefined;
  events?: ConnectorEventProcessors;
  minimumSupportedRelease?: string;
  maximumSupportedRelease?: string;
  actions: Action[];
  triggers: Trigger[];
  categories?: ConnectorCategory[];
  deprecated?: boolean;
};

type ConnectorEventProcessors = {
  parseAndReply: (ctx: { payload: EventPayload, server: Omit<ServerContext, 'token' | 'apiUrl'> }) => ParseEventResponse;
  verify: (ctx: {
    webhookSecret: string | Record<string, string>;
    payload: EventPayload;
    appWebhookUrl: string;
  }) => boolean;
};

type BackwardCompatibleConnectorMetadata = Omit<ConnectorMetadata, 'name' | 'version' | 'authors' | 'i18n' | 'getContextInfo'> & {
  authors?: ConnectorMetadata['authors']
  i18n?: ConnectorMetadata['i18n']
}

function withConnectionIdentifierFlag(
  auth: ConnectorAuthProperty | ConnectorAuthProperty[] | undefined,
): ConnectorAuthProperty | ConnectorAuthProperty[] | undefined {
  if (auth === undefined) {
    return undefined;
  }
  return Array.isArray(auth) ? auth.map(flagConnectionIdentifier) : flagConnectionIdentifier(auth);
}

function flagConnectionIdentifier(auth: ConnectorAuthProperty): ConnectorAuthProperty {
  return { ...auth, hasConnectionIdentifier: auth.getConnectionIdentifier !== undefined };
}

function isValidSimpleSemver(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version);
}

function isSemverLessThan(a: string, b: string): boolean {
  const [a1, a2, a3] = a.split('.').map(Number);
  const [b1, b2, b3] = b.split('.').map(Number);
  if (a1 !== b1) return a1 < b1;
  if (a2 !== b2) return a2 < b2;
  return a3 < b3;
}

