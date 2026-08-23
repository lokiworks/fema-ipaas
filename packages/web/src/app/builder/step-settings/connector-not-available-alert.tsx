import { t } from 'i18next';
import { AlertTriangle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type ConnectorNotAvailableAlertProps = {
  connectorName: string;
  connectorVersion: string;
};

export const ConnectorNotAvailableAlert = ({
  connectorName,
  connectorVersion,
}: ConnectorNotAvailableAlertProps) => (
  <Alert variant="destructive">
    <AlertTriangle className="size-4" />
    <AlertTitle>{t('Connector not available')}</AlertTitle>
    <AlertDescription>
      {t('connectorNotAvailableOnInstanceNote', {
        connectorName,
        connectorVersion,
      })}
    </AlertDescription>
  </Alert>
);
