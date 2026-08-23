import { createConnector, ConnectorAuth } from '@fema/connector-sdk';
import { ConnectorCategory } from '@fema/connector-sdk';
import { addSubtractDateAction } from './lib/actions/add-subtract-date';
import { dateDifferenceAction } from './lib/actions/date-difference';
import { extractDateParts } from './lib/actions/extract-date-parts';
import { formatDateAction } from './lib/actions/format-date';
import { getCurrentDate } from './lib/actions/get-current-date';
import { nextDayofWeek } from './lib/actions/next-day-of-week';
import { nextDayofYear } from './lib/actions/next-day-of-year';
import { firstDayOfPreviousMonthAction } from './lib/actions/first-day-of-prior-month';
import { lastDayOfPreviousMonthAction } from './lib/actions/last-day-of-prior-month';

const description = `Manipulate, format, and extract time units for all your date and time needs.`;

export const utilityDate = createConnector({
  displayName: 'Date Helper',
  auth: ConnectorAuth.None(),
  minimumSupportedRelease: '0.36.1',
  categories: [ConnectorCategory.CORE],
  logoUrl: 'https://cdn.fema.local/connectors/new-core/date-helper.svg',
  authors: [
    'joeworkman',
    'kishanprmr',
    'MoShizzle',
    'abuaboud',
    'abdultheactiveconnectorr',
    'onyedikachi-david',
  ],
  actions: [
    getCurrentDate,
    formatDateAction,
    extractDateParts,
    dateDifferenceAction,
    addSubtractDateAction,
    nextDayofWeek,
    nextDayofYear,
    firstDayOfPreviousMonthAction,
    lastDayOfPreviousMonthAction,
  ],
  triggers: [],
  description: description,
});
