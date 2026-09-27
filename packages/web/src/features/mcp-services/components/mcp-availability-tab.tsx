import {
  McpAvailabilityMode,
  McpService,
  UserStatus,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ReactNode, useState } from 'react';

import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectEmpty,
  MultiSelectItem,
  MultiSelectList,
  MultiSelectSearch,
  MultiSelectTrigger,
  MultiSelectValue,
} from '@/components/custom/multi-select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { tenantUserHooks } from '@/features/tenant-admin/hooks/tenant-user-hooks';

import { mcpServicesHooks } from '../hooks/mcp-services-hooks';

function McpAvailabilityTab({
  service,
  canEdit,
}: {
  service: McpService;
  canEdit: boolean;
}) {
  const { data: usersPage } = tenantUserHooks.useUsers();
  const activeUsers = (usersPage?.data ?? []).filter(
    (user) => user.status === UserStatus.ACTIVE,
  );
  const [mode, setMode] = useState(service.availability.mode);
  const [userIds, setUserIds] = useState(service.availability.userIds);
  const dirty =
    mode !== service.availability.mode ||
    (mode === McpAvailabilityMode.MEMBERS &&
      JSON.stringify([...userIds].sort()) !==
        JSON.stringify([...service.availability.userIds].sort()));
  const coveredCount =
    mode === McpAvailabilityMode.ALL
      ? activeUsers.length
      : activeUsers.filter((user) => userIds.includes(user.id)).length;
  const error =
    mode === McpAvailabilityMode.MEMBERS && userIds.length === 0
      ? t('Choose at least one member')
      : null;
  const { mutate: save, isPending } = mcpServicesHooks.useUpdateAvailability(
    service.id,
  );

  if (!canEdit) {
    return (
      <div className="flex max-w-xl flex-col gap-3 text-sm">
        <Fact label={t('Availability')}>
          {service.availability.mode === McpAvailabilityMode.ALL
            ? t('Everyone')
            : activeUsers
                .filter((user) =>
                  service.availability.userIds.includes(user.id),
                )
                .map(
                  (user) =>
                    `${user.firstName} ${user.lastName}`.trim() || user.email,
                )
                .join('、') || t('Nobody selected')}
        </Fact>
        <Fact label={t('Members covered')}>
          {t('{count} members', { count: coveredCount })}
        </Fact>
      </div>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label>{t('Availability')}</Label>
        <p className="text-xs text-muted-foreground">
          {t(
            'Only members within this scope can connect and call this service. Changes take effect immediately without publishing. This platform has no department concept, so choose specific members instead.',
          )}
        </p>
      </div>
      <RadioGroup
        value={mode}
        onValueChange={(value) => setMode(value as McpAvailabilityMode)}
        className="flex flex-col gap-2"
      >
        <label className="flex items-center gap-2">
          <RadioGroupItem value={McpAvailabilityMode.ALL} />
          <span className="text-sm">{t('Everyone')}</span>
        </label>
        <label className="flex items-center gap-2">
          <RadioGroupItem value={McpAvailabilityMode.MEMBERS} />
          <span className="text-sm">{t('Specific members')}</span>
        </label>
      </RadioGroup>
      {mode === McpAvailabilityMode.MEMBERS && (
        <div className="flex flex-col gap-1">
          <MultiSelect
            value={userIds}
            onValueChange={setUserIds}
            items={activeUsers.map((user) => ({
              value: user.id,
              label: `${user.firstName} ${user.lastName}`.trim() || user.email,
            }))}
          >
            <MultiSelectTrigger>
              <MultiSelectValue placeholder={t('Search and select members')} />
            </MultiSelectTrigger>
            <MultiSelectContent>
              <MultiSelectSearch placeholder={t('Search...')} />
              <MultiSelectList>
                <MultiSelectEmpty>{t('No results')}</MultiSelectEmpty>
                {activeUsers.map((user) => (
                  <MultiSelectItem key={user.id} value={user.id}>
                    {`${user.firstName} ${user.lastName}`.trim() || user.email}
                  </MultiSelectItem>
                ))}
              </MultiSelectList>
            </MultiSelectContent>
          </MultiSelect>
          {dirty && error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {t('This scope currently covers {count} members', {
          count: coveredCount,
        })}
      </p>
      <div className="flex items-center justify-end gap-2 border-t pt-3">
        {dirty && (
          <span className="text-xs text-muted-foreground">
            {t('Unsaved changes')}
          </span>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={!dirty}
          onClick={() => {
            setMode(service.availability.mode);
            setUserIds(service.availability.userIds);
          }}
        >
          {t('Cancel')}
        </Button>
        <Button
          type="button"
          disabled={!dirty || Boolean(error)}
          loading={isPending}
          onClick={() =>
            save({
              availability: {
                mode,
                userIds: mode === McpAvailabilityMode.ALL ? [] : userIds,
              },
            })
          }
        >
          {t('Save')}
        </Button>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}

export { McpAvailabilityTab };
