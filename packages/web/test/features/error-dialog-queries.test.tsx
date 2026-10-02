/**
 * @vitest-environment jsdom
 */
/* eslint-disable testing-library/no-unnecessary-act */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { dataStoresHooks } from '@/features/data-stores/hooks/data-stores-hooks';
import { mappingTablesHooks } from '@/features/mapping-tables/hooks/mapping-tables-hooks';
import { privacyHooks } from '@/features/privacy/hooks/privacy-hooks';
import { tenantAccessHooks } from '@/features/tenant-access/hooks/tenant-access-hooks';
import { triggerRuntimeHooks } from '@/features/trigger-runtime/hooks/trigger-runtime-hooks';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/lib/authentication-session', () => ({
  authenticationSession: {
    getProjectId: () => 'project-1',
    getToken: () => 'token',
  },
}));

const never = () => new Promise<never>(() => undefined);

vi.mock('@/features/privacy/api/privacy-api', () => ({
  privacyApi: { get: () => never() },
}));
vi.mock('@/features/trigger-runtime/api/trigger-runtime-api', () => ({
  triggerRuntimeApi: { getHolidayCalendar: () => never() },
}));
vi.mock('@/features/mapping-tables/api/mapping-tables-api', () => ({
  mappingTablesApi: { get: () => never() },
}));
vi.mock('@/features/data-stores/api/data-stores-api', () => ({
  dataStoresApi: { listRecords: () => never() },
}));
vi.mock('@/features/tenant-access/api/tenant-access-api', () => ({
  tenantAccessApi: { getEncryptionStatus: () => never() },
}));

async function queryMetaOf({ useHook }: { useHook: () => unknown }) {
  const queryClient = new QueryClient();
  function Probe() {
    useHook();
    return null;
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  const meta = queryClient.getQueryCache().getAll()[0]?.meta;
  await act(async () => root.unmount());
  return meta;
}

describe('primary page data asks for the error dialog', () => {
  it('shows it when the encryption status cannot be loaded', async () => {
    const meta = await queryMetaOf({
      useHook: () => tenantAccessHooks.useEncryptionStatus(),
    });
    expect(meta?.showErrorDialog).toBe(true);
  });

  it('shows it when a mapping table cannot be loaded into its editor', async () => {
    const meta = await queryMetaOf({
      useHook: () => mappingTablesHooks.useMappingTable('table-1'),
    });
    expect(meta?.showErrorDialog).toBe(true);
  });

  it('shows it when the records of a data store cannot be loaded', async () => {
    const meta = await queryMetaOf({
      useHook: () => dataStoresHooks.useRecords({ id: 'store-1', search: '' }),
    });
    expect(meta?.showErrorDialog).toBe(true);
  });

  it('shows it for the holiday calendar and privacy settings only on their own pages', async () => {
    const quiet = await queryMetaOf({
      useHook: () => triggerRuntimeHooks.useHolidayCalendar(),
    });
    const page = await queryMetaOf({
      useHook: () =>
        triggerRuntimeHooks.useHolidayCalendar({ showErrorDialog: true }),
    });
    const quietPrivacy = await queryMetaOf({
      useHook: () => privacyHooks.useSettings(),
    });
    const pagePrivacy = await queryMetaOf({
      useHook: () => privacyHooks.useSettings({ showErrorDialog: true }),
    });

    expect(quiet?.showErrorDialog).toBe(false);
    expect(page?.showErrorDialog).toBe(true);
    expect(quietPrivacy?.showErrorDialog).toBe(false);
    expect(pagePrivacy?.showErrorDialog).toBe(true);
  });
});
