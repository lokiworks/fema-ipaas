import { HttpMethod } from '@fema-ipaas/connector-common';
import { fixOwnerMarker, tryCatchSync, type RateLimitContext } from '@fema-ipaas/connector-sdk';
import { z } from 'zod';
import { beisenCommon, type BeisenAuthValue } from './index';

async function page({ auth, rateLimit, rootOrganizationId, pageToken, pageSize }: PageParams): Promise<DirectoryPage> {
  const root = Number(rootOrganizationId);
  if (!Number.isSafeInteger(root) || root <= 0 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 300) {
    throw new Error(fixOwnerMarker.attach({ message: 'Invalid employee enumeration root or page size', owner: 'WORKFLOW_OWNER' }));
  }
  const cursor = pageToken ? decode({ value: pageToken, rootOrganizationId }) : null;
  const result = await beisenCommon.callApi<{ code?: number | string; message?: string; data?: Record<string, unknown>[]; scrollId?: string; isLastData?: boolean }>({
    auth, rateLimit, method: HttpMethod.POST,
    path: '/TenantBaseExternal/api/v5/Employee/GetEmployeeOfOrganization',
    body: { orgOId: root, includeSubOrg: true, isWithDisable: true, withDisabled: true, isWithDeleted: false, isGetLatestRecord: false, employType: [0, 2], serviceType: [0], capacity: pageSize, scrollId: cursor?.scrollId ?? '', queryDate: null },
  });
  if (result.code !== undefined && !beisenCommon.isSuccessCode(result.code)) throw beisenCommon.businessError({ code: result.code, message: result.message });
  const items = result.data ?? [];
  if (cursor && items.length === 0) throw new Error(fixOwnerMarker.attach({ message: 'The employee scroll ended before the promised next page. The cursor may have expired; restart the full scan.', owner: 'WAIT' }));
  const nextPageToken = items.length > 0 && result.scrollId && !result.isLastData ? Buffer.from(JSON.stringify({ scrollId: result.scrollId, issuedAt: Date.now(), rootOrganizationId })).toString('base64url') : null;
  return { items, nextPageToken };
}

async function find({ auth, rateLimit, rootOrganizationId, employeeNo }: Omit<PageParams, 'pageToken' | 'pageSize'> & { employeeNo: string }): Promise<Record<string, unknown> | null> {
  let pageToken: string | null = null;
  let found: Record<string, unknown> | null = null;
  for (let index = 0; index < 167; index++) {
    const result = await page({ auth, rateLimit, rootOrganizationId, pageToken: pageToken ?? undefined, pageSize: Math.min(300, 50000 - index * 300) });
    for (const item of result.items) {
      if (String(beisenCommon.readPath({ record: item, path: 'recordInfo.jobNumber' })) === employeeNo) {
        if (found) throw new Error(fixOwnerMarker.attach({ message: 'Several current employee records have the same employee number', owner: 'SOURCE_DATA_OWNER' }));
        found = item;
      }
    }
    if (!result.nextPageToken) return found;
    pageToken = result.nextPageToken;
  }
  throw new Error('Employee lookup exceeded 50000 records; no absence was confirmed');
}

function decode({ value, rootOrganizationId }: { value: string; rootOrganizationId: string }): z.infer<typeof Cursor> {
  const parsed = tryCatchSync(() => Cursor.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))));
  if (parsed.error || parsed.data.rootOrganizationId !== rootOrganizationId || Date.now() - parsed.data.issuedAt >= 9000) {
    throw new Error(fixOwnerMarker.attach({ message: 'Beisen employee cursor expired or changed scope; start the full scan again', owner: 'WAIT' }));
  }
  return parsed.data;
}

export const beisenEmployeeDirectory = { page, find };

const Cursor = z.object({ scrollId: z.string(), issuedAt: z.number(), rootOrganizationId: z.string() });
type PageParams = { auth: BeisenAuthValue; rateLimit?: RateLimitContext; rootOrganizationId: string; pageToken?: string; pageSize: number };
type DirectoryPage = { items: Record<string, unknown>[]; nextPageToken: string | null };
