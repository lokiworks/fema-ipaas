import { FlowComponentCategory } from '@fema-ipaas/component-sdk';
import { describe, expect, it } from 'vitest';

import { TranslatedComponentMetadata } from '@/features/components/api/components-api';
import { componentSearchUtils } from '@/features/components/utils/component-search-utils';

const httpResponse: TranslatedComponentMetadata = {
  type: 'runtime/http-response',
  displayName: '返回 HTTP 响应',
  description: '回复触发本次运行的 HTTP 请求',
  category: FlowComponentCategory.RUNTIME,
  icon: 'reply',
  props: {},
  originalText:
    'HTTP Response Answer the HTTP request that started this run runtime/http-response',
};

describe('componentSearchUtils.matches', () => {
  it('finds the HTTP response component when searching for webhook', () => {
    expect(
      componentSearchUtils.matches({
        component: httpResponse,
        searchQuery: 'webhook',
      }),
    ).toBe(true);
  });

  it('still matches by the translated name and ignores unrelated words', () => {
    expect(
      componentSearchUtils.matches({
        component: httpResponse,
        searchQuery: '响应',
      }),
    ).toBe(true);
    expect(
      componentSearchUtils.matches({
        component: httpResponse,
        searchQuery: 'slack',
      }),
    ).toBe(false);
  });
});
