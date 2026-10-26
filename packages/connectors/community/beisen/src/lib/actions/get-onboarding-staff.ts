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
      'Read pre-onboarding records — personal details, education, family, entry and employment records — for people who accepted an offer but have not started. Pick this to provision accounts, equipment or training before day one. It only returns people still in the pre-onboarding state, takes the Beisen user IDs (GUIDs) of the recruiting module, accepts at most 1000 per call and never modifies Beisen data.',
    idempotent: true,
  },
  reliability: { rateLimits: [{ bucket: 'beisen-api', scope: 'TENANT', perSecond: 50 }] },
  props: {
    userIds: Property.Array({
      displayName: 'User IDs',
      description: 'Beisen user IDs of the people joining, as the recruiting module shows them. At most 1000 per call.',
      required: true,
    }),
  },
  async run(context) {
    const userIds = context.propsValue.userIds.map(String);
    if (userIds.length > MAX_IDS) {
      throw new Error(`Beisen accepts at most ${MAX_IDS} user IDs per call, but ${userIds.length} were given. Split the list across several steps.`);
    }
    const staff = await beisenCommon.callBusinessApi<unknown[]>({
      auth: context.auth,
      rateLimit: context.rateLimit,
      method: HttpMethod.POST,
      path: '/RecruitV6/api/v1/RecruitOnBoarding/GetStaffInfos',
      body: userIds,
    });
    return staff ?? [];
  },
});

const MAX_IDS = 1000;
