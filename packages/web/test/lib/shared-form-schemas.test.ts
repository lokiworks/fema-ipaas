import { readFileSync } from 'fs';
import path from 'path';

import * as shared from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

type FieldValue = string | number | null | undefined | string[];

const FORM_SCHEMAS: Record<string, z.ZodType> = {
  UpsertNotificationChannelRequestBody:
    shared.UpsertNotificationChannelRequestBody,
  UpsertDataStoreRecordRequestBody: shared.UpsertDataStoreRecordRequestBody,
  UpsertAlertPolicyRequestBody: shared.UpsertAlertPolicyRequestBody,
  UpdateTenantMemberAccessRequestBody:
    shared.UpdateTenantMemberAccessRequestBody,
  UpdateProfileRequestBody: shared.UpdateProfileRequestBody,
  UpdatePrivacySettingsRequestBody: shared.UpdatePrivacySettingsRequestBody,
  UpdateModuleAccessSettingsRequestBody:
    shared.UpdateModuleAccessSettingsRequestBody,
  UpdateMcpServiceInfoRequestBody: shared.UpdateMcpServiceInfoRequestBody,
  UpdateDataStoreRequestBody: shared.UpdateDataStoreRequestBody,
  UpdateConnectionAccessRequestBody: shared.UpdateConnectionAccessRequestBody,
  UpdateBlueprintCanaryRequest: shared.UpdateBlueprintCanaryRequest,
  TransferMcpServiceRequestBody: shared.TransferMcpServiceRequestBody,
  TransferBlueprintOwnershipRequest: shared.TransferBlueprintOwnershipRequest,
  SaveProjectInfoRequestBody: shared.SaveProjectInfoRequestBody,
  PublishMcpServiceRequestBody: shared.PublishMcpServiceRequestBody,
  CreateWorkflowReleaseRequestBody: shared.CreateWorkflowReleaseRequestBody,
  CreatePersonalAccessTokenRequestBody:
    shared.CreatePersonalAccessTokenRequestBody,
  CreateModuleAccessRequestBody: shared.CreateModuleAccessRequestBody,
  CreateMcpServiceRequestBody: shared.CreateMcpServiceRequestBody,
  CreateDataErasureRequestBody: shared.CreateDataErasureRequestBody,
  CreateConnectorDemandRequestBody: shared.CreateConnectorDemandRequestBody,
  CreateConnectorBlueprintRequest: shared.CreateConnectorBlueprintRequest,
  ImportOpenApiBlueprintRequest: shared.ImportOpenApiBlueprintRequest,
  AddConnectionSharesRequestBody: shared.AddConnectionSharesRequestBody,
};
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
  const fields = schema instanceof z.ZodObject ? Object.keys(schema.shape) : [];
  const offenders = fields.flatMap((field) =>
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

  it.each(Object.entries(FORM_SCHEMAS))(
    '%s reports length and range problems with translated keys',
    (_name, schema) => {
      expect(schema).toBeDefined();
      expect(untranslatedRangeMessages({ schema, catalog: en })).toEqual([]);
      expect(untranslatedRangeMessages({ schema, catalog: zh })).toEqual([]);
    },
  );
});
