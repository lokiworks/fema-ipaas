import { assertNotNullOrUndefined, isNil, parseToJsonIfPossible } from '@fema/core-utils'
import { WorkflowVersion } from '@fema/shared'

let webhookSecrets:
| Record<string, { webhookSecret: string | Record<string, string> }>
| undefined = undefined

export const webhookSecretsUtils = {
    init,
    getWebhookSecret,
    parseWebhookSecrets,
}

async function init(_webhookSecrets: string) {
    const parsed = parseWebhookSecrets(_webhookSecrets)
    webhookSecrets = parsed
}

function parseWebhookSecrets(webhookSecrets: string): Record<
string,
{
    webhookSecret: string | Record<string, string>
}
> {
    return (
        (parseToJsonIfPossible(webhookSecrets) as
      | Record<
      string,
      {
          webhookSecret: string | Record<string, string>
      }
      >
      | undefined) ?? {}
    )
}

async function getWebhookSecret(
    workflowVersion: WorkflowVersion,
): Promise<string | Record<string, string> | undefined> {
    const appName = workflowVersion.trigger.settings.connectorName
    if (!appName) {
        return undefined
    }
    assertNotNullOrUndefined(
        webhookSecrets,
        'Webhook secrets are not initialized',
    )
    const appConfig = webhookSecrets[appName]
    if (isNil(appConfig)) {
        return undefined
    }
    return appConfig.webhookSecret
}
