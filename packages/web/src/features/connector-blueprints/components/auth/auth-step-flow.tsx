import {
  BlueprintAuth,
  BlueprintAuthFlow,
  BlueprintAuthFlowStep,
  BlueprintAuthProblem,
  BlueprintAuthType,
  BlueprintFlowRequirement,
  BlueprintHttpMethod,
  ConnectorBlueprintDetail,
  SIGNING_PLUGIN_TEMPLATE,
  blueprintFactory,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

import { authDraftUtils } from './auth-draft-utils';

export function AuthStepFlow({
  detail,
  draft,
  setDraft,
  problems,
}: {
  detail: ConnectorBlueprintDetail;
  draft: BlueprintAuth;
  setDraft: (auth: BlueprintAuth) => void;
  problems: BlueprintAuthProblem[];
}) {
  const requirements = blueprintFactory.flowRequirements(draft.type);
  const isAuthorizationCode =
    draft.type === BlueprintAuthType.AUTHORIZATION_CODE;

  return (
    <div className="flex flex-col gap-4">
      {isAuthorizationCode && (
        <OAuthUrlsCard draft={draft} setDraft={setDraft} problems={problems} />
      )}
      {requirements.map((requirement) => (
        <FlowStepCard
          key={requirement.flow}
          baseUrl={detail.definition.baseUrl}
          type={draft.type}
          requirement={requirement}
          step={authDraftUtils.flowStepOf({
            auth: draft,
            flow: requirement.flow,
          })}
          onChange={(patch) =>
            setDraft(
              authDraftUtils.withFlowStep({
                auth: draft,
                flow: requirement.flow,
                patch,
              }),
            )
          }
        />
      ))}
      <SigningPluginCard
        draft={draft}
        setDraft={setDraft}
        problems={problems}
      />
    </div>
  );
}

function OAuthUrlsCard({
  draft,
  setDraft,
  problems,
}: {
  draft: BlueprintAuth;
  setDraft: (auth: BlueprintAuth) => void;
  problems: BlueprintAuthProblem[];
}) {
  const invalid = problems.includes(BlueprintAuthProblem.OAUTH_URLS);
  return (
    <section className="flex flex-col gap-3 rounded-md border p-4">
      <h2 className="font-medium">{t('Authorization and token endpoints')}</h2>
      <div className="flex flex-col gap-1.5">
        <Label showRequiredIndicator>{t('Authorize URL')}</Label>
        <Input
          className="font-mono"
          value={draft.authorizeUrl}
          aria-invalid={invalid}
          placeholder="https://example.com/oauth/authorize"
          onChange={(event) =>
            setDraft({ ...draft, authorizeUrl: event.target.value })
          }
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label showRequiredIndicator>{t('Token URL')}</Label>
        <Input
          className="font-mono"
          value={draft.tokenUrl}
          aria-invalid={invalid}
          placeholder="https://example.com/oauth/token"
          onChange={(event) =>
            setDraft({ ...draft, tokenUrl: event.target.value })
          }
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>{t('Scope')}</Label>
        <Input
          value={draft.scope}
          placeholder="read write"
          onChange={(event) =>
            setDraft({ ...draft, scope: event.target.value })
          }
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <Label>{t('PKCE')}</Label>
          <p className="text-xs text-muted-foreground">
            {t(
              'Adds a code challenge to the authorization request for extra security',
            )}
          </p>
        </div>
        <Switch
          checked={draft.pkce}
          onCheckedChange={(checked) => setDraft({ ...draft, pkce: checked })}
        />
      </div>
      {invalid && (
        <p className="text-xs text-destructive">
          {t('Enter a valid authorize URL and token URL')}
        </p>
      )}
      <Alert>
        <AlertDescription>
          {t(
            'Getting and refreshing the access token follows the standard OAuth 2.0 authorization code exchange, run by the platform.',
          )}
        </AlertDescription>
      </Alert>
    </section>
  );
}

function FlowStepCard({
  baseUrl,
  type,
  requirement,
  step,
  onChange,
}: {
  baseUrl: string;
  type: BlueprintAuthType;
  requirement: BlueprintFlowRequirement;
  step: BlueprintAuthFlowStep;
  onChange: (patch: Partial<BlueprintAuthFlowStep>) => void;
}) {
  const meta = flowMetaOf({ type, flow: requirement.flow });
  const enabled = requirement.required || step.enabled;
  const error = authDraftUtils.flowStepError({
    required: requirement.required,
    enabled: step.enabled,
    step,
  });
  const urlHint = step.url.startsWith('/')
    ? t('Relative to Base URL: {url}', { url: `${baseUrl}${step.url}` })
    : '';

  return (
    <section className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="font-medium">{meta.title}</h2>
          <Badge variant={requirement.required ? 'default' : 'secondary'}>
            {requirement.required ? t('Required') : t('Optional')}
          </Badge>
        </div>
        {!requirement.required && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t('Enabled')}
            </span>
            <Switch
              checked={step.enabled}
              onCheckedChange={(checked) => onChange({ enabled: checked })}
            />
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{meta.description}</p>
      {enabled ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label showRequiredIndicator>{t('Request address')}</Label>
            <div className="flex gap-2">
              <Select
                value={step.method}
                onValueChange={(value) =>
                  onChange({
                    method:
                      value === BlueprintHttpMethod.POST
                        ? BlueprintHttpMethod.POST
                        : BlueprintHttpMethod.GET,
                  })
                }
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={BlueprintHttpMethod.GET}>GET</SelectItem>
                  <SelectItem value={BlueprintHttpMethod.POST}>POST</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="flex-1 font-mono"
                value={step.url}
                placeholder="/oauth/token"
                aria-invalid={
                  error === 'URL_REQUIRED' || error === 'URL_INVALID'
                }
                onChange={(event) => onChange({ url: event.target.value })}
              />
            </div>
            {urlHint && (
              <p className="text-xs text-muted-foreground">{urlHint}</p>
            )}
            {(error === 'URL_REQUIRED' || error === 'URL_INVALID') && (
              <p className="text-xs text-destructive">
                {authDraftUtils.flowStepErrorMessage(error)}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('Request config')}</Label>
            <Textarea
              className="font-mono text-xs"
              rows={6}
              value={step.config}
              aria-invalid={error === 'CONFIG_INVALID'}
              onChange={(event) => onChange({ config: event.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                'JSON, may contain headers, query and body. Set bodyType to "FORM" for a form-encoded body.',
              )}{' '}
              <code className="rounded bg-muted px-1 font-mono">
                {'{{authInput.x}}'}
              </code>{' '}
              {t('refers to the authentication form,')}{' '}
              <code className="rounded bg-muted px-1 font-mono">
                {'{{authData.x}}'}
              </code>{' '}
              {t('refers to the token response.')}
            </p>
            {error === 'CONFIG_INVALID' && (
              <p className="text-xs text-destructive">
                {authDraftUtils.flowStepErrorMessage(error)}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{meta.resultPathLabel}</Label>
            <Input
              className="font-mono"
              value={step.resultPath}
              onChange={(event) => onChange({ resultPath: event.target.value })}
            />
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t('Disabled, this step will not run.')}
        </p>
      )}
    </section>
  );
}

function SigningPluginCard({
  draft,
  setDraft,
  problems,
}: {
  draft: BlueprintAuth;
  setDraft: (auth: BlueprintAuth) => void;
  problems: BlueprintAuthProblem[];
}) {
  const invalid = problems.includes(BlueprintAuthProblem.PLUGIN);
  return (
    <section className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="font-medium">{t('Token and signing plugin')}</h2>
          <Badge variant="secondary">{t('Optional')}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t('Enabled')}</span>
          <Switch
            checked={draft.plugin.enabled}
            onCheckedChange={(checked) =>
              setDraft({
                ...draft,
                plugin: {
                  enabled: checked,
                  code:
                    draft.plugin.code.trim().length > 0
                      ? draft.plugin.code
                      : SIGNING_PLUGIN_TEMPLATE,
                },
              })
            }
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {t(
          'Use JavaScript to process the request before every send, for example to sign it or add a timestamp.',
        )}
      </p>
      {draft.plugin.enabled ? (
        <>
          <Textarea
            className="font-mono text-xs"
            rows={10}
            value={draft.plugin.code}
            aria-invalid={invalid}
            onChange={(event) =>
              setDraft({
                ...draft,
                plugin: { ...draft.plugin, code: event.target.value },
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            {t('Runs on the worker before every request.')}{' '}
            <code className="rounded bg-muted px-1 font-mono">
              {'request = {method, url, headers, query, body}'}
            </code>
            {'; '}
            <code className="rounded bg-muted px-1 font-mono">
              {'auth = {input, data}'}
            </code>
            {'. '}
            {t(
              'crypto, Buffer and helpers.sha256/md5/hmacSha256 are available.',
            )}
          </p>
          {invalid && (
            <p className="text-xs text-destructive">
              {t('The plugin code must define a beforeRequest function')}
            </p>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{t('Not enabled.')}</p>
      )}
    </section>
  );
}

function flowMetaOf({
  type,
  flow,
}: {
  type: BlueprintAuthType;
  flow: BlueprintAuthFlow;
}): { title: string; description: string; resultPathLabel: string } {
  if (flow === BlueprintAuthFlow.TOKEN) {
    return {
      title: t('Get access token'),
      description: t(
        'Exchange the Client ID and Client Secret for an access token',
      ),
      resultPathLabel: t('Path to the access token in the response'),
    };
  }
  const resultPathLabel = t(
    'Path to the account name shown in the connection list',
  );
  if (type === BlueprintAuthType.AUTHORIZATION_CODE) {
    return {
      title: t('Get the authorized user'),
      description: t(
        'Read the authorized account info, shown in the connection list',
      ),
      resultPathLabel,
    };
  }
  if (type === BlueprintAuthType.CLIENT_CREDENTIALS) {
    return {
      title: t('Get the authorized user'),
      description: t(
        'Read the app or account info, shown in the connection list',
      ),
      resultPathLabel,
    };
  }
  return {
    title: t('Get the authorized user'),
    description: t(
      'Call once with the entered credentials to check whether they are valid',
    ),
    resultPathLabel,
  };
}
