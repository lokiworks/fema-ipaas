import { HttpMethod } from '@fema-ipaas/connector-common';
import { Property, createAction } from '@fema-ipaas/connector-sdk';

import { beisenAuth } from '../auth';
import { beisenCommon } from '../common';

export const findApplicant = createAction({
  auth: beisenAuth,
  name: 'find_applicant',
  displayName: 'Find Applicant',
  description: 'Find Beisen applicant IDs by email, mobile, ID number or candidate code',
  audience: 'both',
  classification: 'SEARCH',
  aiMetadata: {
    description:
      'Look up Beisen applicant IDs from an email, mobile number, identity document number or candidate code. Pick this as the first step of any recruitment flow, since Get Applicant Resume needs an applicant ID. Every value you supply is combined with AND, and the result is an empty list when nobody matches.',
    idempotent: true,
  },
  props: {
    email: Property.ShortText({
      displayName: 'Email',
      required: false,
    }),
    mobile: Property.ShortText({
      displayName: 'Mobile',
      required: false,
    }),
    certificateNumber: Property.ShortText({
      displayName: 'ID Number',
      description: 'Identity document number recorded on the application.',
      required: false,
    }),
    candidateId: Property.ShortText({
      displayName: 'Candidate Code',
      description: 'The candidate code Beisen shows as CXXXXXXX.',
      required: false,
    }),
  },
  async run(context) {
    const { email, mobile, certificateNumber, candidateId } = context.propsValue;
    const applicantIds = await beisenCommon.callBusinessApi<string[]>({
      auth: context.auth,
      method: HttpMethod.POST,
      path: '/RecruitV6/api/v1/Applicant/GetApplicantIds',
      body: {
        ...(email ? { email } : {}),
        ...(mobile ? { mobile } : {}),
        ...(certificateNumber ? { certificateNumber } : {}),
        ...(candidateId ? { candidateId } : {}),
      },
    });
    return {
      applicant_ids: applicantIds,
      count: applicantIds.length,
      found: applicantIds.length > 0,
    };
  },
});
