import { ConnectorCategory, createConnector } from '@fema-ipaas/connector-sdk';

import { beisenAuth } from './lib/auth';
import { findApplicant } from './lib/actions/find-applicant';
import { getApplicantResume } from './lib/actions/get-applicant-resume';
import { getEmploymentRecords } from './lib/actions/get-employment-records';
import { getOnboardingStaff } from './lib/actions/get-onboarding-staff';
import { getSubOrganizations } from './lib/actions/get-sub-organizations';
import { searchChangedEmployees } from './lib/actions/search-changed-employees';
import { employeeChanged } from './lib/triggers/employee-changed';

export const beisen = createConnector({
  displayName: 'Beisen',
  description:
    'Sync employees, the department tree, applicants and pre-onboarding records out of Beisen iTalent',
  minimumSupportedRelease: '0.30.0',
  categories: [ConnectorCategory.HUMAN_RESOURCES],
  logoUrl: '/assets/connectors/beisen.svg',
  authors: ['lokiworks'],
  auth: beisenAuth,
  actions: [
    searchChangedEmployees,
    getEmploymentRecords,
    getSubOrganizations,
    findApplicant,
    getApplicantResume,
    getOnboardingStaff,
  ],
  triggers: [employeeChanged],
});
