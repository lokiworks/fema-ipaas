import {
  createTrigger,
  DynamicPropsValue,
  ConnectorAuth,
  Property,
  StoreScope,
  TriggerStrategy,
} from '@fema/connector-sdk';
import { callableWorkflowKey, CallableWorkflowRequest, MOCK_CALLBACK_IN_TEST_WORKFLOW_URL } from '../common';

export const callableWorkflow = createTrigger({
  name: 'callableWorkflow',
  classification: 'READ',
  displayName: 'Callable Workflow',
  description: 'Waiting to be triggered from another workflow',
  aiMetadata: {
    description: 'Fires when another workflow invokes this one through the Sub Workflows "Call Workflow" or "Stream CSV to Subflows" action, making this workflow a reusable subroutine; the event represents a single invocation and carries the payload the caller passed in. The Sample Data entered here (key-value in Simple mode or JSON in Advanced mode) defines the payload shape offered to callers, and adding a "Return Response" action lets a waiting caller receive a result.',
  },
  props: {
    mode: Property.StaticDropdown({
      displayName: 'Mode',
      required: true,
      description: 'Choose Simple for key-value or Advanced for JSON.',
      defaultValue: 'simple',
      options: {
        disabled: false,
        options: [
          {
            label: 'Simple',
            value: 'simple',
          },
          {
            label: 'Advanced',
            value: 'advanced',
          },
        ],
      },
    }),
    exampleData: Property.DynamicProperties({
      auth: ConnectorAuth.None(),
      displayName: 'Sample Data',
      description: 'The schema to be passed to the workflow',
      required: true,
      refreshers: ['mode'],
      props: async (propsValue) => {
        const mode = propsValue['mode'] as unknown as string;
        const fields: DynamicPropsValue = {};
        if (mode === 'simple') {
          fields['sampleData'] = Property.Object({
            displayName: 'Sample Data',
            required: true,
          });
        } else {
          fields['sampleData'] = Property.Json({
            displayName: 'Sample Data',
            required: true,
          });
        }
        return fields;
      },
    }),
  },
  sampleData: null,
  type: TriggerStrategy.WEBHOOK,
  async onEnable() {
    // ignore
  },
  async onDisable() {
    // ignore
  },
  async test(context) {
    const request: CallableWorkflowRequest = {
      data: context.propsValue.exampleData['sampleData'],
      callbackUrl: MOCK_CALLBACK_IN_TEST_WORKFLOW_URL
    }
    return [request];
  },
  async run(context) {
    return [context.payload.body];
  },
  async onStart(context) {
    const request = context.payload as CallableWorkflowRequest;
    if (request.callbackUrl) {
      await context.store.put(callableWorkflowKey(context.run.id), request.callbackUrl, StoreScope.WORKFLOW);
    }
  }
});
