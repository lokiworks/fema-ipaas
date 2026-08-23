import { TriggerBase, TriggerStrategy } from '@fema-ipaas/connector-sdk';
import { TriggerTestStrategy } from '@fema-ipaas/shared';

import { connectorSelectorUtils } from '@/features/connectors';

export type TestType =
  | 'mcp-tool'
  | 'chat-trigger'
  | 'simulation'
  | 'webhook'
  | 'polling';

export const triggerEventUtils = {
  getTestType: ({
    triggerName,
    connectorName,
    trigger,
  }: {
    triggerName: string;
    connectorName: string;
    trigger: TriggerBase;
  }): TestType => {
    if (connectorSelectorUtils.isMcpToolTrigger(connectorName, triggerName)) {
      return 'mcp-tool';
    }
    if (connectorSelectorUtils.isChatTrigger(connectorName, triggerName)) {
      return 'chat-trigger';
    }
    if (
      connectorName === '@fema-ipaas/connector-webhook' &&
      triggerName === 'catch_webhook'
    ) {
      return 'webhook';
    }

    if (
      trigger.type === TriggerStrategy.APP_WEBHOOK ||
      trigger.type === TriggerStrategy.WEBHOOK
    ) {
      switch (trigger.testStrategy) {
        case TriggerTestStrategy.TEST_FUNCTION:
          return 'polling';
        case TriggerTestStrategy.SIMULATION:
          return 'simulation';
      }
    }

    return 'polling';
  },
};
