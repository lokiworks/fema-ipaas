import { useQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

export function OutboundIpNotice() {
  const { data, isPending } = useQuery({ queryKey: ['connection-outbound-ip'], queryFn: () => api.get<{ address: string | null }>('/v1/connections/outbound-ip'), staleTime: 15 * 60000, retry: false });
  return <div className="mb-4 flex flex-col gap-2 text-sm"><label htmlFor="connection-outbound-ip" className="font-medium">{t('connections.apiOutboundIp')}</label><Input id="connection-outbound-ip" readOnly value={data?.address ?? ''} placeholder={t(isPending ? 'connections.outboundIpLoading' : 'connections.outboundIpManual')} /><p className="text-xs text-muted-foreground">{t('connections.outboundIpHelp')}</p></div>;
}
