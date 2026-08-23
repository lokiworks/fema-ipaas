import { z } from 'zod'

export enum PackageType {
    ARCHIVE = 'ARCHIVE',
    REGISTRY = 'REGISTRY',
}

export enum ConnectorType {
    CUSTOM = 'CUSTOM',
    OFFICIAL = 'OFFICIAL',
}

export const PrivateConnectorPackage = z.object({
    packageType: z.literal(PackageType.ARCHIVE),
    connectorType: z.nativeEnum(ConnectorType),
    connectorName: z.string(),
    connectorVersion: z.string(),
    archiveId: z.string(),
    platformId: z.string(),
})

export type PrivateConnectorPackage = z.infer<typeof PrivateConnectorPackage>

export const OfficialConnectorPackage = z.object({
    packageType: z.literal(PackageType.REGISTRY),
    connectorType: z.literal(ConnectorType.OFFICIAL),
    connectorName: z.string(),
    connectorVersion: z.string(),
})

export type OfficialConnectorPackage = z.infer<typeof OfficialConnectorPackage>

export const CustomNpmConnectorPackage = z.object({
    packageType: z.literal(PackageType.REGISTRY),
    connectorType: z.literal(ConnectorType.CUSTOM),
    connectorName: z.string(),
    connectorVersion: z.string(),
    platformId: z.string(),
})

export type CustomNpmConnectorPackage = z.infer<typeof CustomNpmConnectorPackage>

export const PublicConnectorPackage = z.union([OfficialConnectorPackage, CustomNpmConnectorPackage])
export type PublicConnectorPackage = OfficialConnectorPackage | CustomNpmConnectorPackage

export const ConnectorPackage = z.union([PrivateConnectorPackage, OfficialConnectorPackage, CustomNpmConnectorPackage])
export type ConnectorPackage = PrivateConnectorPackage | OfficialConnectorPackage | CustomNpmConnectorPackage

export enum ConnectorCategory {
    ARTIFICIAL_INTELLIGENCE = 'ARTIFICIAL_INTELLIGENCE',
    COMMUNICATION = 'COMMUNICATION',
    COMMERCE = 'COMMERCE',
    CORE = 'CORE',
    UNIVERSAL_AI = 'UNIVERSAL_AI',
    WORKFLOW_CONTROL = 'WORKFLOW_CONTROL',
    BUSINESS_INTELLIGENCE = 'BUSINESS_INTELLIGENCE',
    ACCOUNTING = 'ACCOUNTING',
    PRODUCTIVITY = 'PRODUCTIVITY',
    CONTENT_AND_FILES = 'CONTENT_AND_FILES',
    DEVELOPER_TOOLS = 'DEVELOPER_TOOLS',
    CUSTOMER_SUPPORT = 'CUSTOMER_SUPPORT',
    FORMS_AND_SURVEYS = 'FORMS_AND_SURVEYS',
    HUMAN_RESOURCES = 'HUMAN_RESOURCES',
    PAYMENT_PROCESSING = 'PAYMENT_PROCESSING',
    MARKETING = 'MARKETING',
    SALES_AND_CRM = 'SALES_AND_CRM',
}
