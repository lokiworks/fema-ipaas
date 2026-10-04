import { t } from 'i18next';

function guideFor({ connectorName, message }: GuideForParams): string | null {
  const entry = CONNECTOR_ERROR_GUIDES.find((candidate) =>
    connectorMatches({ connectorName, key: candidate.connector }),
  );
  if (entry === undefined) {
    return null;
  }
  const rule = entry.rules.find((candidate) => candidate.pattern.test(message));
  return (rule?.guide ?? entry.fallback)();
}

function connectorMatches({ connectorName, key }: MatchParams): boolean {
  return connectorName === key || connectorName.endsWith(`connector-${key}`);
}

export const connectorErrorGuideUtils = { guideFor };

const CONNECTOR_ERROR_GUIDES: ConnectorErrorGuide[] = [
  {
    connector: 'beisen',
    rules: [
      {
        pattern:
          /app_key|app_secret|invalid_client|access_token|Beisen error 4000[13]|Key and Secret/i,
        guide: () =>
          t(
            'Check app_key and app_secret: they must match the connector Key and Secret in the Beisen admin console. Then check which APIs the tenant has enabled for that app.',
          ),
      },
      {
        pattern: /rate limit|HTTP 429/i,
        guide: () =>
          t(
            'Check how often the workflows poll Beisen: the whole tenant shares one daily quota, so lower the polling frequency or the history replayed.',
          ),
      },
    ],
    fallback: () =>
      t(
        'Check app_key and app_secret, and which APIs the tenant has enabled for this app in the Beisen admin console.',
      ),
  },
  {
    connector: 'feishu',
    rules: [
      {
        pattern:
          /9999166[34]|app secret|app_secret|app_id|app id|credentials are not valid/i,
        guide: () =>
          t(
            'Check the app credentials: the App ID and App Secret must be copied from the same app in the Feishu Open Platform.',
          ),
      },
      {
        pattern: /99991672|missing the permission|scopes? (is|are) required/i,
        guide: () =>
          t(
            'Check the permission scope: grant the app the permission this step needs in the Feishu Open Platform, then republish the app.',
          ),
      },
      {
        pattern: /40004|41050|contact scope|availability/i,
        guide: () =>
          t(
            'Check the availability scope: add the department or member to the contact scope of the app in the Feishu Open Platform, then republish the app.',
          ),
      },
    ],
    fallback: () =>
      t(
        'Check the app credentials, the permission scopes granted to the app, and the availability scope of the app in the Feishu Open Platform.',
      ),
  },
];

type GuideForParams = {
  connectorName: string;
  message: string;
};

type MatchParams = {
  connectorName: string;
  key: string;
};

type ConnectorErrorRule = {
  pattern: RegExp;
  guide: () => string;
};

type ConnectorErrorGuide = {
  connector: string;
  rules: ConnectorErrorRule[];
  fallback: () => string;
};
