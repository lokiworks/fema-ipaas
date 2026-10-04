import { Permission } from '@fema-ipaas/core-utils';
import { AI_CONNECTOR_NAME } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ExternalLink, Info } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { useNewWindow } from '@/lib/navigation-utils';
import { NEW_CONNECTION_QUERY_PARAM } from '@/lib/route-utils';

import { PlanModelSelection, RULES_MODEL_ID } from '../hooks/ai-hooks';
import { aiUtils } from '../utils/ai-utils';

export function PlanModelField({
  projectId,
  models,
  disabled,
}: {
  projectId: string;
  models: PlanModelSelection;
  disabled: boolean;
}) {
  const { checkAccess } = useAuthorization();
  const openNewWindow = useNewWindow();
  if (models.isLoading) {
    return <Skeleton className="h-9 w-full" />;
  }
  const createConnection = () =>
    openNewWindow(
      projectId
        ? `/projects/${projectId}/connections`
        : authenticationSession.appendProjectRoutePrefix('/connections'),
      new URLSearchParams({
        [NEW_CONNECTION_QUERY_PARAM]: AI_CONNECTOR_NAME,
      }).toString(),
    );
  const canCreate = checkAccess(Permission.WRITE_CONNECTION);
  if (models.connections.length === 0) {
    return (
      <Alert variant="primary" data-testid="plan-no-model">
        <Info className="size-4" />
        <AlertDescription className="flex flex-col items-start gap-2">
          <span>
            {t(
              'No model connection yet, so planning uses built-in rules. Rules only understand common Beisen to Feishu requests such as onboarding, offboarding and transfers.',
            )}
          </span>
          {canCreate ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={createConnection}
            >
              <ExternalLink className="size-4 mr-1" />
              {t('Create a model connection')}
            </Button>
          ) : (
            <span className="text-xs">
              {t('Ask a project admin to create one.')}
            </span>
          )}
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="ai-plan-model">{t('Planner')}</Label>
      <Select
        value={models.selectedId ?? RULES_MODEL_ID}
        onValueChange={models.select}
        disabled={disabled}
      >
        <SelectTrigger id="ai-plan-model">
          <SelectValue placeholder={t('Choose a model connection')} />
        </SelectTrigger>
        <SelectContent>
          {models.connections.map((connection) => (
            <SelectItem
              key={connection.externalId}
              value={connection.externalId}
            >
              {connection.displayName} ·{' '}
              {aiUtils.providerLabel(connection.provider)} {connection.model}
            </SelectItem>
          ))}
          <SelectItem value={RULES_MODEL_ID}>
            {t('Built-in rules (no model)')}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
