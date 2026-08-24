import { NetworkAgentStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';

import {
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { networkAgentsHooks } from '@/features/network-agents';

const DIRECT_VALUE = 'direct';

export const NetworkAgentSelector = ({ name }: { name: string }) => {
  const { data: agents } = networkAgentsHooks.useNetworkAgents();
  const usableAgents = (agents?.data ?? []).filter(
    (agent) => agent.status !== NetworkAgentStatus.DISABLED,
  );

  if (usableAgents.length === 0) {
    return null;
  }

  return (
    <FormField
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-col gap-2">
          <FormLabel>{t('Reach through')}</FormLabel>
          <Select
            value={field.value ?? DIRECT_VALUE}
            onValueChange={(value) =>
              field.onChange(value === DIRECT_VALUE ? null : value)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t('The platform itself')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DIRECT_VALUE}>
                {t('The platform itself')}
              </SelectItem>
              {usableAgents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormDescription className="text-xs">
            {t(
              'Pick an agent when the system sits inside a network the platform cannot reach.',
            )}
          </FormDescription>
        </FormItem>
      )}
    />
  );
};
