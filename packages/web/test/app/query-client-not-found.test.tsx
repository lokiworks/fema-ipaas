import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { openQueryErrorDialog } = vi.hoisted(() => ({
  openQueryErrorDialog: vi.fn(),
}));

vi.mock('@/components/custom/error-dialog/error-dialog-store', () => ({
  openQueryErrorDialog,
}));
vi.mock('@/components/ui/sonner', () => ({ internalErrorToast: vi.fn() }));

import { queryClient } from '@/app/query-client';

function failWith({ status, data }: { status: number; data: unknown }) {
  const config = { headers: new AxiosHeaders() };
  const error = new AxiosError('failed', String(status), config, null, {
    status,
    statusText: '',
    headers: {},
    config,
    data,
  });
  return queryClient
    .fetchQuery({
      queryKey: ['detail', String(status), JSON.stringify(data)],
      queryFn: () => Promise.reject(error),
      retry: false,
      meta: { showErrorDialog: true, loadSubsetOptions: {} },
    })
    .catch(() => undefined);
}

describe('query client error dialog', () => {
  beforeEach(() => {
    openQueryErrorDialog.mockClear();
    queryClient.clear();
  });

  it('does not show the technical dialog for a malformed id, the page shows not found instead', async () => {
    await failWith({
      status: 400,
      data: {
        code: 'FST_ERR_VALIDATION',
        message: 'params/id Invalid string: must match pattern',
      },
    });
    expect(openQueryErrorDialog).not.toHaveBeenCalled();
  });

  it('still shows the dialog for a real failure', async () => {
    await failWith({ status: 500, data: { message: 'boom' } });
    expect(openQueryErrorDialog).toHaveBeenCalledTimes(1);
  });
});
