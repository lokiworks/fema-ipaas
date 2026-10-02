import { readFileSync } from 'fs';
import path from 'path';

import * as shared from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

type FieldValue = string | number | null | undefined | string[];

const FORM_SCHEMA_NAMES = [
  'UpsertNotificationChannelRequestBody',
  'UpsertDataStoreRecordRequestBody',
  'UpsertAlertPolicyRequestBody',
  'UpdateTenantMemberAccessRequestBody',
  'UpdateProfileRequestBody',
  'UpdatePrivacySettingsRequestBody',
  'UpdateModuleAccessSettingsRequestBody',
  'UpdateMcpServiceInfoRequestBody',
  'UpdateDataStoreRequestBody',
  'UpdateConnectionAccessRequestBody',
  'UpdateBlueprintCanaryRequest',
  'TransferMcpServiceRequestBody',
  'TransferBlueprintOwnershipRequest',
  'SaveProjectInfoRequestBody',
  'PublishMcpServiceRequestBody',
  'CreateWorkflowReleaseRequestBody',
  'CreatePersonalAccessTokenRequestBody',
  'CreateModuleAccessRequestBody',
  'CreateMcpServiceRequestBody',
  'CreateDataErasureRequestBody',
  'CreateConnectorDemandRequestBody',
  'CreateConnectorBlueprintRequest',
  'ImportOpenApiBlueprintRequest',
  'AddConnectionSharesRequestBody',
];
const RANGE_CODES = ['too_big', 'too_small', 'invalid_format'];
const PROBE_VALUES: FieldValue[] = [
  '',
  ' ',
  'x',
  'x'.repeat(5000),
  '😀'.repeat(300),
  -1,
  0,
  1.5,
  1e12,
  [],
  ['x'.repeat(200)],
];

function loadCatalog(lang: 'en' | 'zh'): Record<string, string> {
  return JSON.parse(
    readFileSync(
      path.resolve(__dirname, `../../public/locales/${lang}/translation.json`),
      'utf-8',
    ),
  );
}

function untranslatedRangeMessages({
  schema,
  catalog,
}: {
  schema: z.ZodType;
  catalog: Record<string, string>;
}): string[] {
  const shape = (schema as unknown as { shape?: Record<string, z.ZodType> })
    .shape;
  if (!shape) {
    return [];
  }
  const offenders = Object.keys(shape).flatMap((field) =>
    PROBE_VALUES.flatMap((value) => {
      const result = schema.safeParse({ [field]: value });
      return result.success
        ? []
        : result.error.issues
            .filter(
              (issue) =>
                RANGE_CODES.includes(issue.code) && !(issue.message in catalog),
            )
            .map((issue) => `${field}: ${issue.message}`);
    }),
  );
  return [...new Set(offenders)];
}

describe('schemas that back web forms', () => {
  const en = loadCatalog('en');
  const zh = loadCatalog('zh');

  it.each(FORM_SCHEMA_NAMES)(
    '%s reports length and range problems with translated keys',
    (name) => {
      const schema = (shared as Record<string, unknown>)[name];
      expect(schema).toBeDefined();
      expect(
        untranslatedRangeMessages({ schema: schema as z.ZodType, catalog: en }),
      ).toEqual([]);
      expect(
        untranslatedRangeMessages({ schema: schema as z.ZodType, catalog: zh }),
      ).toEqual([]);
    },
  );
});
