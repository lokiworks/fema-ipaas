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
      {
        pattern: /Beisen code 417/i,
        guide: () =>
          t(
            'Check the step settings: Beisen rejected the request parameters, and the message says which one.',
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
        pattern: /99991401|IP allowlist/i,
        guide: () =>
          t(
            'Check the IP allowlist: add the outbound IP address of this server to the app security settings in the Feishu Open Platform.',
          ),
      },
      {
        pattern: /99991403|API call quota/i,
        guide: () =>
          t(
            'The Feishu free edition limits the API calls of custom apps per month: ask a Feishu administrator to upgrade the edition, or wait for the first of next month. Messages count toward the limit, contact calls do not.',
          ),
      },
      {
        pattern: /4100[123]\b|41053|already belongs|already exists/i,
        guide: () =>
          t(
            'Check who holds this mobile number or email in Feishu: an administrator may have to cancel or remove the old account, or the holder may sit outside the contact scope of the app.',
          ),
      },
      {
        pattern: /40015|41017|44035|department does not exist/i,
        guide: () =>
          t(
            'Check the department mapping table: the mapped department no longer exists in Feishu, so correct the mapping or recreate the department.',
          ),
      },
      {
        pattern:
          /4100[45]\b|4401[89]|44020|mobile number format|unverified Feishu/i,
        guide: () =>
          t(
            'Check the mobile number and email of the employee in the HR system: Feishu rejected their format or region.',
          ),
      },
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
