import { HttpMethod } from '@fema-ipaas/connector-common';
import { Property, createAction } from '@fema-ipaas/connector-sdk';

import { beisenAuth } from '../auth';
import { beisenCommon } from '../common';

export const getApplicantResume = createAction({
  auth: beisenAuth,
  name: 'get_applicant_resume',
  displayName: 'Get Applicant Resume',
  description: 'Read the standard resume of one Beisen applicant',
  audience: 'both',
  classification: 'READ',
  aiMetadata: {
    description:
      'Read one Beisen applicant standard resume, covering education, work experience, projects, certificates and attachments. Pick this after Find Applicant when a flow needs resume content, for example to file a candidate into another system. It reads only and needs the applicant ID rather than an email.',
    idempotent: true,
  },
  props: {
    applicantId: Property.ShortText({
      displayName: 'Applicant ID',
      description: 'The applicant ID returned by Find Applicant.',
      required: true,
    }),
    shortLink: Property.Checkbox({
      displayName: 'Short Login-Free Link',
      description: 'Return the login-free resume link as a short URL.',
      required: false,
      defaultValue: false,
    }),
  },
  async run(context) {
    const { applicantId, shortLink } = context.propsValue;
    return beisenCommon.callBusinessApi<unknown>({
      auth: context.auth,
      method: HttpMethod.GET,
      path: '/RecruitV6/api/v1/Applicant/GetResume',
      queryParams: {
        applicantId,
        isShortUrl: String(shortLink ?? false),
      },
    });
  },
});
