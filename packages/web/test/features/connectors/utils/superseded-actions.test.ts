import { describe, expect, it } from 'vitest';

import { supersededActions } from '@/features/connectors/utils/superseded-actions';

const action = (name: string) => ({
  name,
  displayName: name,
  description: name,
  props: {},
  requireAuth: false,
});

describe('supersededActions', () => {
  it('drops the webhook response action that the HTTP response component replaces', () => {
    const connector = supersededActions.withoutSupersededActions({
      name: '@fema-ipaas/connector-webhook',
      suggestedActions: [
        action('return_response'),
        action('return_response_and_wait_for_next_webhook'),
      ],
    });
    expect(connector.suggestedActions?.map((entry) => entry.name)).toEqual([
      'return_response_and_wait_for_next_webhook',
    ]);
  });

  it('drops the advanced mapping action that the mapper component replaces', () => {
    const connector = supersededActions.withoutSupersededActions({
      name: '@fema-ipaas/connector-data-mapper',
      suggestedActions: [action('advanced_mapping'), action('map_fields')],
    });
    expect(connector.suggestedActions?.map((entry) => entry.name)).toEqual([
      'map_fields',
    ]);
  });

  it('leaves other connectors untouched', () => {
    const connector = {
      name: '@fema-ipaas/connector-http',
      suggestedActions: [action('send_request')],
    };
    expect(supersededActions.withoutSupersededActions(connector)).toBe(
      connector,
    );
  });
});
