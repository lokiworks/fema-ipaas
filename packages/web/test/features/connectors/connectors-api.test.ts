import { PropertyType } from '@fema-ipaas/connector-sdk';
import { ConnectorOptionRequest } from '@fema-ipaas/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('i18next', () => ({
  t: (key: string) => key,
  default: { language: 'zh-CN' },
}));

const internalErrorToast = vi.fn();
vi.mock('@/components/ui/sonner', () => ({
  internalErrorToast: () => internalErrorToast(),
}));

const post = vi.fn();
vi.mock('@/lib/api', () => ({ api: { post: (...args: unknown[]) => post(...args) } }));

import { connectorsApi } from '@/features/connectors/api/connectors-api';

const request = {} as ConnectorOptionRequest;

describe('connectorsApi.options', () => {
  beforeEach(() => {
    post.mockReset();
    internalErrorToast.mockReset();
  });

  it('sends the current UI language with the request', async () => {
    post.mockResolvedValue({ type: PropertyType.DROPDOWN, options: {} });

    await connectorsApi.options(request, PropertyType.DROPDOWN);

    expect(post).toHaveBeenCalledWith('/v1/connectors/options', {
      locale: 'zh-CN',
    });
  });

  it('rejects for DYNAMIC so callers can restore the cleared value', async () => {
    const failure = new Error('boom');
    post.mockRejectedValue(failure);

    await expect(
      connectorsApi.options(request, PropertyType.DYNAMIC),
    ).rejects.toBe(failure);
  });

  it('resolves a disabled dropdown state for DROPDOWN', async () => {
    post.mockRejectedValue(new Error('boom'));

    const result = await connectorsApi.options(request, PropertyType.DROPDOWN);

    expect(result.type).toBe(PropertyType.DROPDOWN);
    expect(result.options.disabled).toBe(true);
    expect(internalErrorToast).toHaveBeenCalledTimes(1);
  });
});
