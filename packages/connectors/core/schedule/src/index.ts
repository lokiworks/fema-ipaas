import { ConnectorAuth, createConnector } from '@fema-ipaas/connector-sdk';
import { ConnectorCategory } from '@fema-ipaas/connector-sdk';
import { cronExpressionTrigger } from './lib/triggers/cron-expression.trigger';
import { everyDayTrigger } from './lib/triggers/every-day.trigger';
import { everyHourTrigger } from './lib/triggers/every-hour.trigger';
import { everyMonthTrigger } from './lib/triggers/every-month.trigger';
import { everyWeekTrigger } from './lib/triggers/every-week.trigger';
import { everyXMinutesTrigger } from './lib/triggers/every-x-minutes.trigger';

export const schedule = createConnector({
  displayName: 'Schedule',
  logoUrl: '/assets/connectors/schedule.svg',
  description: 'Trigger workflow with fixed schedule',
  categories: [ConnectorCategory.CORE],
  auth: ConnectorAuth.None(),
  minimumSupportedRelease: '0.30.0',
  authors: ["kishanprmr","AbdulTheActiveConnectorr","khaledmashaly","abuaboud"],
  actions: [],
  triggers: [
    everyXMinutesTrigger,
    everyHourTrigger,
    everyDayTrigger,
    everyWeekTrigger,
    everyMonthTrigger,
    cronExpressionTrigger,
  ],
});
