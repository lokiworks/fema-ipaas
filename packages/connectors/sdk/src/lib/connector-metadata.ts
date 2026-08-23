import { ConnectorPropertyMap } from "./property";
import { WebhookRenewConfiguration } from "./trigger/trigger";
import { ErrorHandlingOptionsParam } from "./action/action";
import { ConnectorAuthProperty } from "./property/authentication";
import * as z from "zod/mini";
import { LocalesEnum } from "@fema/core-utils";
import { PackageType, ConnectorCategory, ConnectorType, TriggerStrategy, TriggerTestStrategy, WebhookHandshakeConfiguration } from "@fema/connector-types";
import { ContextVersion } from "./context/versioning";
import type { OutputSchema } from "./output-schema";

const I18nForConnector = z.optional(z.record(z.string(), z.record(z.string(), z.string())));
export type I18nForConnector = Partial<Record<LocalesEnum, Record<string, string>>> | undefined
export const ConnectorBase = z.object({
  id: z.optional(z.string()),
  name: z.string(),
  displayName: z.string(),
  logoUrl: z.string(),
  description: z.string(),
  authors: z.array(z.string()),
  platformId: z.optional(z.string()),
  directoryPath: z.optional(z.string()),
  auth: z.optional(z.union([ConnectorAuthProperty, z.array(ConnectorAuthProperty)])),
  version: z.string(),
  categories: z.optional(z.array(z.enum(ConnectorCategory))),
  minimumSupportedRelease: z.optional(z.string()),
  maximumSupportedRelease: z.optional(z.string()),
  deprecated: z.optional(z.boolean()),
  i18n: I18nForConnector,
})

export type ConnectorBase = {
  id?: string;
  name: string;
  displayName: string;
  logoUrl: string;
  description: string;
  platformId?: string;
  authors: string[],
  directoryPath?: string;
  auth?: ConnectorAuthProperty | ConnectorAuthProperty[];
  version: string;
  categories?: ConnectorCategory[];
  minimumSupportedRelease?: string;
  maximumSupportedRelease?: string;
  deprecated?: boolean;
  i18n?: Partial<Record<LocalesEnum, Record<string, string>>>
  // this method didn't exist in older version
  getContextInfo: (() => { version: ContextVersion }) | undefined;
}


export const Audience = z.enum(['human', 'ai', 'both'])
export type Audience = z.infer<typeof Audience>

export const AiMetadata = z.object({
  description: z.optional(z.string()),
  idempotent: z.optional(z.boolean()),
})
export type AiMetadata = z.infer<typeof AiMetadata>

export const ActionClassification = z.enum(['READ', 'SEARCH', 'WRITE', 'DESTRUCTIVE'])
export type ActionClassification = z.infer<typeof ActionClassification>

export const READ_ONLY_CLASSIFICATIONS: readonly ActionClassification[] = ['READ', 'SEARCH']

export const isReadOnlyClassification = (classification: ActionClassification | undefined): boolean =>
  classification !== undefined && READ_ONLY_CLASSIFICATIONS.includes(classification)

export const PropertyGroupDisplay = z.enum(['tabs', 'section', 'summary', 'builder', 'footer'])
export type PropertyGroupDisplay = z.infer<typeof PropertyGroupDisplay>

export const PropertyGroup = z.object({
  key: z.string(),
  display: PropertyGroupDisplay,
  label: z.optional(z.string()),
  description: z.optional(z.string()),
  icon: z.optional(z.string()),
  props: z.array(z.string()),
})
export type PropertyGroup = z.infer<typeof PropertyGroup>

export const ActionBase = z.object({
  name: z.string(),
  displayName: z.string(),
  description: z.string(),
  props: ConnectorPropertyMap,
  propertyGroups: z.optional(z.array(PropertyGroup)),
  requireAuth: z.boolean(),
  errorHandlingOptions: z.optional(ErrorHandlingOptionsParam),
  outputSchema: z.optional(z.custom<OutputSchema>()),
  audience: z.optional(Audience),
  aiMetadata: z.optional(AiMetadata),
  classification: z.optional(ActionClassification),
})

export type ActionBase = {
  name: string,
  displayName: string,
  description: string,
  props: ConnectorPropertyMap,
  propertyGroups?: PropertyGroup[];
  requireAuth: boolean;
  errorHandlingOptions?: ErrorHandlingOptionsParam;
  outputSchema?: OutputSchema;
  audience?: Audience;
  aiMetadata?: AiMetadata;
  classification?: ActionClassification;
}

export const TriggerBase = z.object({
  name: z.string(),
  displayName: z.string(),
  description: z.string(),
  props: ConnectorPropertyMap,
  propertyGroups: z.optional(z.array(PropertyGroup)),
  errorHandlingOptions: z.optional(ErrorHandlingOptionsParam),
  type: z.enum(TriggerStrategy),
  sampleData: z.unknown(),
  handshakeConfiguration: z.optional(z.custom<WebhookHandshakeConfiguration>()),
  renewConfiguration: z.optional(WebhookRenewConfiguration),
  testStrategy: z.enum(TriggerTestStrategy),
  outputSchema: z.optional(z.custom<OutputSchema>()),
  aiMetadata: z.optional(AiMetadata),
  classification: z.optional(ActionClassification),
})
export type TriggerBase = Omit<ActionBase, 'audience'> & {
  type: TriggerStrategy;
  sampleData: unknown,
  handshakeConfiguration?: WebhookHandshakeConfiguration;
  renewConfiguration?: WebhookRenewConfiguration;
  testStrategy: TriggerTestStrategy;
};

export const ConnectorMetadata = z.object({
  ...ConnectorBase.shape,
  actions: z.record(z.string(), ActionBase),
  triggers: z.record(z.string(), TriggerBase),
})

export type ConnectorMetadata = Omit<ConnectorBase, 'getContextInfo'> & {
  actions: Record<string, ActionBase>;
  triggers: Record<string, TriggerBase>;
  // this property didn't exist in older version
  contextInfo: { version: ContextVersion } | undefined;
};

export const ConnectorMetadataSummary = z.object({
  ...ConnectorBase.shape,
  actions: z.number(),
  triggers: z.number(),
  suggestedActions: z.optional(z.array(ActionBase)),
  suggestedTriggers: z.optional(z.array(TriggerBase)),
})
export type ConnectorMetadataSummary = Omit<ConnectorMetadata, "actions" | "triggers"> & {
  actions: number;
  triggers: number;
  suggestedActions?: ActionBase[];
  suggestedTriggers?: TriggerBase[];
}


const ConnectorPackageMetadata = z.object({
  workspaceUsage: z.number(),
  connectorType: z.enum(ConnectorType),
  packageType: z.enum(PackageType),
  platformId: z.optional(z.string()),
  archiveId: z.optional(z.string()),
})
type ConnectorPackageMetadata = z.infer<typeof ConnectorPackageMetadata>

export const ConnectorMetadataModel = z.object({
  ...ConnectorMetadata.shape,
  ...ConnectorPackageMetadata.shape,
})
export type ConnectorMetadataModel = ConnectorMetadata & ConnectorPackageMetadata

export const ConnectorMetadataModelSummary = z.object({
  ...ConnectorMetadataSummary.shape,
  ...ConnectorPackageMetadata.shape,
})
export type ConnectorMetadataModelSummary = ConnectorMetadataSummary & ConnectorPackageMetadata;

export const ConnectorPackageInformation = z.object({
  name: z.string(),
  version: z.string(),
})
export type ConnectorPackageInformation = z.infer<typeof ConnectorPackageInformation>
