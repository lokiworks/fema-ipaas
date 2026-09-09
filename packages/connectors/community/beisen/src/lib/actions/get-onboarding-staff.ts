import { HttpMethod } from '@fema-ipaas/connector-common';
import { Property, createAction } from '@fema-ipaas/connector-sdk';

import { beisenAuth } from '../auth';
import { beisenCommon } from '../common';

export const getOnboardingStaff = createAction({
  auth: beisenAuth,
  name: 'get_onboarding_staff',
  displayName: 'Get Onboarding Staff',
  description: 'Read the pre-onboarding information of people who have not started yet',
  audience: 'both',
  classification: 'READ',
  aiMetadata: {
    description:
      'Read pre-onboarding records — personal details, education, family, entry and employment records — for people who accepted an offer but have not started. Pick this to provision accounts, equipment or training before day one. It only returns people still in the pre-onboarding state, accepts at most 1000 user IDs per call, and never modifies Beisen data.',
    idempotent: true,
  },
  props: {
    userIds: Property.Array({
      displayName: 'User IDs',
      description: 'Beisen user IDs of the people joining. At most 1000 per call.',
      required: true,
    }),
  },
  async run(context) {
    const { userIds } = context.propsValue;
    return beisenCommon.callBusinessApi<unknown>({
      auth: context.auth,
      method: HttpMethod.POST,
      path: '/RecruitV6/api/v1/RecruitOnBoarding/GetStaffInfos',
      body: userIds,
    });
  },
});
