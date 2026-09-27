import { Permission } from '@fema-ipaas/core-utils';
import { AI_CONNECTOR_NAME, AiModelConnection } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ExternalLink, TriangleAlert } from 'lucide-react';

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

import { aiUtils } from '../utils/ai-utils';

export function ModelConnectionSelect({
  connections,
  isLoading,
  value,
  onChange,
  disabled,
}: ModelConnectionSelectProps) {
  if (isLoading) {
    return <Skeleton className="h-9 w-full" />;
  }
  if (connections.length === 0) {
    return <NoModelConnectionAlert />;
  }
  return (
    <div className="flex flex-col gap-2">
      <Label>{t('Model')}</Label>
      <Select
        value={value ?? undefined}
        onValueChange={onChange}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder={t('Choose a model connection')} />
        </SelectTrigger>
        <SelectContent>
          {connections.map((connection) => (
            <SelectItem
              key={connection.externalId}
              value={connection.externalId}
            >
              {connection.displayName} ·{' '}
              {aiUtils.providerLabel(connection.provider)} {connection.model}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function NoModelConnectionAlert() {
  const { checkAccess } = useAuthorization();
  const openNewWindow = useNewWindow();
  const canCreate = checkAccess(Permission.WRITE_CONNECTION);
  return (
    <Alert variant="warning">
      <TriangleAlert className="size-4" />
      <AlertDescription className="flex flex-col items-start gap-2">
        <span>
          {t(
            'AI features need a model connection. Create a connection for the AI connector (Claude, OpenAI, DeepSeek or an OpenAI-compatible model).',
          )}
        </span>
        {canCreate ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              openNewWindow(
                authenticationSession.appendProjectRoutePrefix('/connections'),
                new URLSearchParams({
                  [NEW_CONNECTION_QUERY_PARAM]: AI_CONNECTOR_NAME,
                }).toString(),
              )
            }
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

type ModelConnectionSelectProps = {
  connections: AiModelConnection[];
  isLoading: boolean;
  value: string | null;
  onChange: (externalId: string) => void;
  disabled?: boolean;
};
