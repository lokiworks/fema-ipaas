import {
  CreatePlatformClientRequestBody,
  PlatformClientKind,
  PlatformScope,
  TestSmsSettingsRequestBody,
  UpdatePlatformLoginAppRequestBody,
  UpdateSmsSettingsRequestBody,
} from '@fema-ipaas/shared';
import { z } from 'zod';

import { tenantAccessUtils } from '@/features/tenant-access/utils/tenant-access-utils';

import { operatorUtils } from './operator-utils';

type RequestIssue = { path: PropertyKey[]; message: string };

function mapIssues<TField extends string>({
  issues,
  fieldOf,
  fallback,
}: {
  issues: RequestIssue[];
  fieldOf: (key: PropertyKey | undefined) => TField | null;
  fallback: TField;
}): { path: TField[]; message: string }[] {
  return issues.map((issue) => ({
    path: [fieldOf(issue.path[0]) ?? fallback],
    message: issue.message,
  }));
}

const limitText = z
  .string()
  .refine(
    (value) => operatorUtils.parseLimitInput(value).ok,
    'Limits must be whole numbers of 0 or more.',
  );

const LimitInputsSchema = z.object({
  usersLimit: limitText,
  projectsLimit: limitText,
  activeWorkflowsLimit: limitText,
  concurrentExecutionsLimit: limitText,
  workerGroupId: z.string().trim().max(100),
});

const LimitsFormSchema = z.object({ limits: LimitInputsSchema });

const CreateTenantFormSchema = z.object({
  name: z.string().trim().min(1, 'required').max(100),
  slug: z
    .string()
    .trim()
    .refine(
      (value) =>
        value.length === 0 || tenantAccessUtils.slugError(value) === null,
      'tenantSlugInvalid',
    ),
  contact: z.string().refine(
    (value) =>
      operatorUtils.buildOwnerInput({
        contact: value,
        firstName: '',
        lastName: '',
      }) !== null,
    'Enter the owner email address or mobile number',
  ),
  lastName: z.string().trim().max(100),
  firstName: z.string().trim().max(100),
  limits: LimitInputsSchema,
});

const PlatformClientFormSchema = z
  .object({
    kind: z.enum(PlatformClientKind),
    name: z.string(),
    issuer: z.string(),
    subjects: z.string(),
    scopes: z.array(z.enum(PlatformScope)),
  })
  .superRefine((values, ctx) => {
    const parsed = CreatePlatformClientRequestBody.safeParse(
      operatorUtils.platformClientRequest(values),
    );
    if (parsed.success) {
      return;
    }
    mapIssues({
      issues: parsed.error.issues,
      fieldOf: platformClientFieldOf,
      fallback: 'name',
    }).forEach((issue) => ctx.addIssue({ code: 'custom', ...issue }));
  });

function platformClientFieldOf(
  key: PropertyKey | undefined,
): 'name' | 'issuer' | 'subjects' | 'scopes' | null {
  switch (key) {
    case 'name':
      return 'name';
    case 'issuer':
      return 'issuer';
    case 'allowedSubjects':
      return 'subjects';
    case 'scopes':
      return 'scopes';
    default:
      return null;
  }
}

function smsFormSchema({ hasSecret }: { hasSecret: boolean }) {
  return z
    .object({
      provider: z.enum(['ALIYUN', 'TENCENT']),
      accessKeyId: z.string(),
      accessKeySecret: z.string(),
      signName: z.string(),
      templateCode: z.string(),
      sdkAppId: z.string(),
      region: z.string(),
    })
    .superRefine((values, ctx) => {
      if (!hasSecret && values.accessKeySecret.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['accessKeySecret'],
          message: 'required',
        });
      }
      const parsed = UpdateSmsSettingsRequestBody.safeParse(
        operatorUtils.smsRequest(values),
      );
      if (parsed.success) {
        return;
      }
      mapIssues({
        issues: parsed.error.issues,
        fieldOf: smsFieldOf,
        fallback: 'accessKeyId',
      }).forEach((issue) => ctx.addIssue({ code: 'custom', ...issue }));
    });
}

function smsFieldOf(
  key: PropertyKey | undefined,
):
  | 'provider'
  | 'accessKeyId'
  | 'accessKeySecret'
  | 'signName'
  | 'templateCode'
  | 'sdkAppId'
  | 'region'
  | null {
  switch (key) {
    case 'provider':
    case 'accessKeyId':
    case 'accessKeySecret':
    case 'signName':
    case 'templateCode':
    case 'sdkAppId':
    case 'region':
      return key;
    default:
      return null;
  }
}

const SmsTestFormSchema = z
  .object({ phone: z.string() })
  .superRefine((values, ctx) => {
    const parsed = TestSmsSettingsRequestBody.safeParse({
      phone: tenantAccessUtils.normalizePhone(values.phone),
    });
    if (!parsed.success) {
      ctx.addIssue({
        code: 'custom',
        path: ['phone'],
        message: parsed.error.issues[0]?.message ?? 'invalidPhone',
      });
    }
  });

function loginAppFormSchema({ hasSecret }: { hasSecret: boolean }) {
  return z
    .object({
      enabled: z.boolean(),
      appId: z.string(),
      appSecret: z.string(),
      region: z.string(),
      allowSelfSignup: z.boolean(),
    })
    .superRefine((values, ctx) => {
      if (!hasSecret && values.appSecret.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['appSecret'],
          message: 'required',
        });
      }
      const parsed = UpdatePlatformLoginAppRequestBody.safeParse(
        operatorUtils.loginAppRequest(values),
      );
      if (parsed.success) {
        return;
      }
      mapIssues({
        issues: parsed.error.issues,
        fieldOf: loginAppFieldOf,
        fallback: 'appId',
      }).forEach((issue) => ctx.addIssue({ code: 'custom', ...issue }));
    });
}

function loginAppFieldOf(
  key: PropertyKey | undefined,
): 'appId' | 'appSecret' | 'region' | null {
  switch (key) {
    case 'appId':
    case 'appSecret':
    case 'region':
      return key;
    default:
      return null;
  }
}

export const operatorSchemas = {
  limitInputs: LimitInputsSchema,
  limitsForm: LimitsFormSchema,
  createTenantForm: CreateTenantFormSchema,
  platformClientForm: PlatformClientFormSchema,
  smsForm: smsFormSchema,
  smsTestForm: SmsTestFormSchema,
  loginAppForm: loginAppFormSchema,
};

export type LimitsFormValues = z.infer<typeof LimitsFormSchema>;
export type CreateTenantFormValues = z.infer<typeof CreateTenantFormSchema>;
export type PlatformClientFormValues = z.infer<typeof PlatformClientFormSchema>;
export type SmsFormValues = z.infer<ReturnType<typeof smsFormSchema>>;
export type SmsTestFormValues = z.infer<typeof SmsTestFormSchema>;
export type LoginAppFormValues = z.infer<ReturnType<typeof loginAppFormSchema>>;
