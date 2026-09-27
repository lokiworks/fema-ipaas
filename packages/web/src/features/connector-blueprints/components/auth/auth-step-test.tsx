import {
  BlueprintAuthFieldControl,
  BlueprintAuthType,
  BlueprintTestKind,
  BlueprintTestResult,
  BlueprintTestStatus,
  ConnectorBlueprintDetail,
  FlagId,
  blueprintFactory,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { CircleCheck, CircleDashed, CircleX } from 'lucide-react';
import { Fragment, useState } from 'react';
import { toast } from 'sonner';

import { FormattedDate } from '@/components/custom/formatted-date';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { oauth2Utils } from '@/features/connections';
import { flagsHooks } from '@/hooks/flags-hooks';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

import { connectorBlueprintHooks } from '../../hooks/connector-blueprint-hooks';

import { authOAuthUtils } from './auth-oauth-utils';
import { AuthTestDataDialog } from './auth-test-data-dialog';

export function AuthStepTest({
  detail,
  dirty,
}: {
  detail: ConnectorBlueprintDetail;
  dirty: boolean;
}) {
  const auth = detail.definition.auth;
  const [dataOpen, setDataOpen] = useState(false);
  const [operationKey, setOperationKey] = useState<string | null>(
    detail.definition.operations[0]?.key ?? null,
  );
  const [flowRunning, setFlowRunning] = useState(false);
  const { data: thirdPartyUrl } = flagsHooks.useFlag<string>(
    FlagId.THIRD_PARTY_AUTH_PROVIDER_REDIRECT_URL,
  );
  const flowTest = connectorBlueprintHooks.useRunBlueprintAuthTest({
    id: detail.id,
  });
  const apiTest = connectorBlueprintHooks.useRunBlueprintAuthTest({
    id: detail.id,
  });

  if (!auth) {
    return null;
  }

  const redirectUrl = thirdPartyUrl ?? 'no_redirect_url_found';
  const fields = [
    ...blueprintFactory.autoAuthFields(auth.type),
    ...auth.fields,
  ];
  const testData = detail.authStatus.testData;
  const disabledReason = dirty ? t('Save your changes before testing') : null;

  const runFlowTest = async () => {
    setFlowRunning(true);
    try {
      if (auth.type === BlueprintAuthType.AUTHORIZATION_CODE) {
        const clientId = testData['client_id'] ?? '';
        if (clientId.trim().length === 0) {
          toast.error(t('Fill in the Client ID in the test data first'));
          return;
        }
        const { authorizationUrl, codeVerifier } =
          await authOAuthUtils.authorizationRequestOf({
            authorizeUrl: auth.authorizeUrl,
            clientId,
            redirectUrl,
            scope: auth.scope,
            pkce: auth.pkce,
          });
        const { code } = await oauth2Utils.openOAuth2Popup({
          authorizationUrl,
          redirectUrl,
          codeVerifier,
        });
        await flowTest.mutateAsync({
          kind: BlueprintTestKind.FLOW,
          operationKey: null,
          projectId: null,
          code,
          redirectUrl,
          codeVerifier: codeVerifier ?? null,
        });
      } else {
        await flowTest.mutateAsync({
          kind: BlueprintTestKind.FLOW,
          operationKey: null,
          projectId: null,
          code: null,
          redirectUrl: null,
          codeVerifier: null,
        });
      }
      toast.success(t('Authentication flow test passed'));
    } catch (error) {
      toast.error(
        api.extractServerErrorMessage(
          error,
          t('Authentication flow test failed'),
        ),
      );
    } finally {
      setFlowRunning(false);
    }
  };

  const runApiTest = async () => {
    if (!operationKey) {
      return;
    }
    try {
      await apiTest.mutateAsync({
        kind: BlueprintTestKind.API,
        operationKey,
        projectId: null,
        code: null,
        redirectUrl: null,
        codeVerifier: null,
      });
      toast.success(t('Business API test passed'));
    } catch (error) {
      toast.error(
        api.extractServerErrorMessage(error, t('Business API test failed')),
      );
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-md border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">{t('Test data')}</h2>
          <Button size="sm" onClick={() => setDataOpen(true)}>
            {t('Edit test data')}
          </Button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {fields.map((field) => (
            <Fragment key={field.key}>
              <dt className="text-muted-foreground">
                {field.label}
                {field.required ? ' *' : ''}
              </dt>
              <dd
                className={cn(
                  field.control === BlueprintAuthFieldControl.PASSWORD &&
                    'font-mono',
                )}
              >
                {testData[field.key]?.trim() ? (
                  testData[field.key]
                ) : (
                  <span className="text-muted-foreground">
                    {t('Not filled in')}
                  </span>
                )}
              </dd>
            </Fragment>
          ))}
        </dl>
        {auth.type === BlueprintAuthType.AUTHORIZATION_CODE && (
          <p className="text-xs text-muted-foreground">
            {detail.authStatus.hasAuthorizationToken
              ? t('An access token has been obtained for testing.')
              : t('No access token yet. Run the flow test to authorize.')}
          </p>
        )}
      </section>
      <section className="flex flex-col gap-3 rounded-md border p-4">
        <TestRow
          title={t('Test authentication flow')}
          description={t(
            'Run through the authentication flow with the test data',
          )}
          running={flowRunning || flowTest.isPending}
          disabledReason={disabledReason}
          onRun={runFlowTest}
          result={detail.authStatus.flowTest}
        />
        <TestRow
          title={t('Call a business API')}
          description={t('Call one operation with the token that was obtained')}
          running={apiTest.isPending}
          disabledReason={
            disabledReason ??
            (!operationKey ? t('This connector has no operations yet') : null)
          }
          onRun={runApiTest}
          result={detail.authStatus.apiTest}
          extra={
            detail.definition.operations.length > 0 ? (
              <Select
                value={operationKey ?? undefined}
                onValueChange={setOperationKey}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {detail.definition.operations.map((operation) => (
                    <SelectItem key={operation.key} value={operation.key}>
                      {operation.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null
          }
        />
        <p className="text-xs text-muted-foreground">
          {t(
            'Both tests can run at the same time. Re-test after changing the authentication configuration or the test data.',
          )}
        </p>
      </section>
      <AuthTestDataDialog
        open={dataOpen}
        onOpenChange={setDataOpen}
        auth={auth}
        detail={detail}
      />
    </div>
  );
}

function TestRow({
  title,
  description,
  running,
  disabledReason,
  onRun,
  result,
  extra,
}: {
  title: string;
  description: string;
  running: boolean;
  disabledReason: string | null;
  onRun: () => void;
  result: BlueprintTestResult | null;
  extra?: React.ReactNode;
}) {
  const passed = result?.status === BlueprintTestStatus.PASSED;
  const failed = result?.status === BlueprintTestStatus.FAILED;
  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      <span
        className={cn(
          'mt-0.5',
          passed
            ? 'text-success'
            : failed
            ? 'text-destructive'
            : 'text-muted-foreground',
        )}
      >
        {passed ? (
          <CircleCheck className="size-4" />
        ) : failed ? (
          <CircleX className="size-4" />
        ) : (
          <CircleDashed className="size-4" />
        )}
      </span>
      <div className="flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p
          className={cn(
            'text-xs',
            failed ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {result ? (
            <>
              {result.message} ·{' '}
              <FormattedDate date={new Date(result.at)} includeTime />
            </>
          ) : (
            description
          )}
        </p>
      </div>
      {extra}
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              size="sm"
              disabled={Boolean(disabledReason)}
              loading={running}
              onClick={onRun}
            >
              {result ? t('Retest') : t('Start test')}
            </Button>
          </span>
        </TooltipTrigger>
        {disabledReason && <TooltipContent>{disabledReason}</TooltipContent>}
      </Tooltip>
    </div>
  );
}
