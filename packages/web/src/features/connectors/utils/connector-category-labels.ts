import { ActionClassification } from '@fema-ipaas/connector-sdk';
import { ConnectorCategory } from '@fema-ipaas/shared';
import { t } from 'i18next';

import { MarketCategoryValue } from './connector-market-utils';

function marketLabel(value: MarketCategoryValue): string {
  return MARKET_LABELS[value]();
}

function categoryLabel(category: ConnectorCategory): string {
  return CATEGORY_LABELS[category]();
}

function classificationLabel(classification: ActionClassification): string {
  return CLASSIFICATION_LABELS[classification]();
}

export const connectorCategoryLabels = {
  marketLabel,
  categoryLabel,
  classificationLabel,
};

const MARKET_LABELS: Record<MarketCategoryValue, () => string> = {
  all: () => t('All'),
  office: () => t('Office & Collaboration'),
  hr: () => t('Human Resources'),
  crm: () => t('Customer Management'),
  erp: () => t('Finance & ERP'),
  dev: () => t('Developer Tools'),
  ecommerce: () => t('Ecommerce & Retail'),
  database: () => t('Databases'),
  storage: () => t('File Storage'),
  ai: () => t('AI Models'),
  marketing: () => t('Marketing & Messaging'),
  builtin: () => t('Built-in Tools'),
  custom: () => t('Custom'),
};

const CATEGORY_LABELS: Record<ConnectorCategory, () => string> = {
  [ConnectorCategory.ARTIFICIAL_INTELLIGENCE]: () =>
    t('Artificial intelligence'),
  [ConnectorCategory.COMMUNICATION]: () => t('Communication'),
  [ConnectorCategory.COMMERCE]: () => t('Commerce'),
  [ConnectorCategory.CORE]: () => t('Core tools'),
  [ConnectorCategory.UNIVERSAL_AI]: () => t('Universal AI'),
  [ConnectorCategory.WORKFLOW_CONTROL]: () => t('Workflow control'),
  [ConnectorCategory.BUSINESS_INTELLIGENCE]: () => t('Business intelligence'),
  [ConnectorCategory.ACCOUNTING]: () => t('Accounting'),
  [ConnectorCategory.PRODUCTIVITY]: () => t('Productivity'),
  [ConnectorCategory.CONTENT_AND_FILES]: () => t('Content and files'),
  [ConnectorCategory.DEVELOPER_TOOLS]: () => t('Developer tools'),
  [ConnectorCategory.CUSTOMER_SUPPORT]: () => t('Customer support'),
  [ConnectorCategory.FORMS_AND_SURVEYS]: () => t('Forms and surveys'),
  [ConnectorCategory.HUMAN_RESOURCES]: () => t('Human resources'),
  [ConnectorCategory.PAYMENT_PROCESSING]: () => t('Payment processing'),
  [ConnectorCategory.MARKETING]: () => t('Marketing'),
  [ConnectorCategory.SALES_AND_CRM]: () => t('Sales and CRM'),
};

const CLASSIFICATION_LABELS: Record<ActionClassification, () => string> = {
  READ: () => t('Read'),
  SEARCH: () => t('Search'),
  WRITE: () => t('Write'),
  DESTRUCTIVE: () => t('Destructive'),
};
