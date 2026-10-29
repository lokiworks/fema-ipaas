import { I18nForConnector, ConnectorMetadataModel, ConnectorMetadataModelSummary } from "./connector-metadata"
import { LocalesEnum } from "@fema-ipaas/core-utils"
import { MAX_KEY_LENGTH_FOR_CORWDIN } from "@fema-ipaas/connector-types"
import path from 'path';
import fs from 'fs/promises';

export const connectorTranslation = {
  translateConnector: <T extends ConnectorMetadataModelSummary | ConnectorMetadataModel>(params: TranslateConnectorParams<T>): T => {
    const { connector, locale, mutate = false } = params
    if (!locale) {
      return connector
    }
    try {
      const target = connector.i18n?.[locale]
      if (!target) {
        return connector
      }
      const translatedConnector: T = mutate ? connector : JSON.parse(JSON.stringify(connector))
      connectorTranslation.pathsToValuesToTranslate.forEach(key => {
        translateProperty(translatedConnector, key, target)
      })
      translateOutputSchemas(translatedConnector, target)
      return translatedConnector
    }
    catch (err) {
      console.error(`error translating connector ${connector.name}:`, err)
      return connector
    }
  },

  /**Gets the connector metadata regardles of connector location (node_modules or dist), wasn't included inside connector.metadata() for backwards compatibility issues (if an old ap version installs a new connector it would fail)*/
  initializeI18n: async (connectorOutputPath: string): Promise<I18nForConnector | undefined> => {
    try {
      const locales = Object.values(LocalesEnum);
      const i18n: I18nForConnector = {};
      
      for (const locale of locales) {
        const translations = await readLocaleFile(locale, connectorOutputPath);
        if (translations) {
          i18n[locale] = translations;
        }
      }
      
      return Object.keys(i18n).length > 0 ? i18n : undefined;
    }
    catch (err) {
      console.log(`Error initializing i18n for ${connectorOutputPath}:`, err)
      return undefined
    }
  },

  pathsToValuesToTranslate: [
    "displayName",
    "description",
    "auth.displayName",
    "auth.username.displayName",
    "auth.username.description",
    "auth.password.displayName",
    "auth.password.description",
    "auth.props.*.displayName",
    "auth.props.*.description",
    "auth.props.*.options.options.*.label",
    "auth.description",
    "actions.*.displayName",
    "actions.*.description",
    "actions.*.props.*.displayName",
    "actions.*.props.*.description",
    "actions.*.props.*.options.options.*.label",
    "triggers.*.displayName",
    "triggers.*.description",
    "triggers.*.props.*.displayName",
    "triggers.*.props.*.description",
    "triggers.*.props.*.options.options.*.label",
    "actions.*.props.*.properties.*.displayName",
    "actions.*.props.*.properties.*.description",
    "actions.*.props.*.properties.*.options.options.*.label",
    "triggers.*.props.*.properties.*.displayName",
    "triggers.*.props.*.properties.*.description",
    "triggers.*.props.*.properties.*.options.options.*.label"
  ]
}


/**This function translates a property inside a connector, i.e description, displayName, etc... 
 * 
 * @param connectorModelOrProperty - The connector model or property to translate
 * @param path - The path to the property to translate, i.e auth.username.displayName
 * @param i18n - The i18n object
 */
function translateProperty(connectorModelOrProperty: Record<string, unknown>, path: string, i18n: Record<string, string>) {
  const parsedKeys = path.split('.');
  if (Array.isArray(connectorModelOrProperty) && parsedKeys[0] !== '*') {
    return connectorModelOrProperty.forEach(item => translateProperty(item, path, i18n))
  }
  if (parsedKeys[0] === '*') {
    return Object.values(connectorModelOrProperty).forEach(item => translateProperty(item as Record<string, unknown>, parsedKeys.slice(1).join('.'), i18n))
  }
  const nextObject = connectorModelOrProperty[parsedKeys[0]] as Record<string, unknown>;
  if (!nextObject) {
    return;
  }
  if (parsedKeys.length > 1) {
    return translateProperty(nextObject, parsedKeys.slice(1).join('.'), i18n);
  }
  const propertyValue = connectorModelOrProperty[parsedKeys[0]] as string
  const valueInI18n = i18n[propertyValue.slice(0, MAX_KEY_LENGTH_FOR_CORWDIN)]
  if (valueInI18n) {
    connectorModelOrProperty[parsedKeys[0]] = valueInI18n
  }
}

function translateOutputSchemas(connector: Record<string, unknown>, i18n: Record<string, string>) {
  OUTPUT_SCHEMA_GROUPS.forEach(group => {
    const entries = connector[group]
    if (!isRecord(entries)) {
      return
    }
    Object.values(entries).forEach(entry => {
      const outputSchema = isRecord(entry) ? entry['outputSchema'] : undefined
      const fields = isRecord(outputSchema) ? outputSchema['fields'] : undefined
      if (Array.isArray(fields)) {
        fields.forEach(field => translateOutputField(field, i18n))
      }
    })
  })
}

function translateOutputField(field: unknown, i18n: Record<string, string>) {
  if (!isRecord(field)) {
    return
  }
  const label = field['label']
  if (typeof label === 'string') {
    const translatedLabel = i18n[label.slice(0, MAX_KEY_LENGTH_FOR_CORWDIN)]
    if (translatedLabel && translatedLabel !== label) {
      field['sourceLabel'] = label
      field['label'] = translatedLabel
    }
  }
  const description = field['description']
  if (typeof description === 'string') {
    const translatedDescription = i18n[description.slice(0, MAX_KEY_LENGTH_FOR_CORWDIN)]
    if (translatedDescription) {
      field['description'] = translatedDescription
    }
  }
  OUTPUT_SCHEMA_NESTED_KEYS.forEach(key => {
    const nested = field[key]
    if (Array.isArray(nested)) {
      nested.forEach(child => translateOutputField(child, i18n))
    }
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

const readLocaleFile = async (locale: LocalesEnum, connectorOutputPath: string) => {
  const filePath = path.join(connectorOutputPath, 'src', 'i18n', `${locale}.json`);
  if (!(await fileExists(filePath))) {
    return null;
  }

  try {
    const fileContent = await fs.readFile(filePath, 'utf8');
    const translations = JSON.parse(fileContent);
    if (typeof translations === 'object' && translations !== null) {
      return translations;
    }
    throw new Error(`Invalid i18n file format for ${locale} in connector ${connectorOutputPath}`);
  } catch (error) {
    console.error(`Error reading i18n file for ${locale} in connector ${connectorOutputPath}:`, error);
    return null;
  }
}

const OUTPUT_SCHEMA_GROUPS = ['actions', 'triggers']
const OUTPUT_SCHEMA_NESTED_KEYS = ['children', 'listItems']

type TranslateConnectorParams<T extends ConnectorMetadataModelSummary | ConnectorMetadataModel> = {
  connector: T
  locale?: LocalesEnum
  mutate?: boolean
}
