import { DynamicPropsValue, ConnectorAuth, Property, StoreScope, createAction } from '@fema-ipaas/connector-sdk';
import { callableWorkflowKey, CallableWorkflowResponse, MOCK_CALLBACK_IN_TEST_WORKFLOW_URL } from '../common';
import { httpClient, HttpMethod } from '@fema-ipaas/connector-common';
import { isNil } from '@fema-ipaas/connector-sdk';

export const response = createAction({
  audience: 'both',
  name: 'returnResponse',
  classification: 'WRITE',
  displayName: 'Return Response',
  description: 'Return response to the original workflow',
  aiMetadata: { description: 'Sends a result payload back to the workflow that invoked this one through Call Workflow, releasing the caller from its wait; the body is entered as key-value pairs (Simple mode) or as raw JSON (Advanced mode). Use it only inside a workflow whose trigger is "Callable Workflow", and only when the caller ran with Wait for Response enabled - it silently does nothing when no callback URL was stored for the run. Not idempotent: each call posts a fresh response to the callback URL of the caller.', idempotent: false },
  props: {
    mode: Property.StaticDropdown({
      displayName: 'Mode',
      description: 'Choose Simple for key-value or Advanced for JSON.',
      required: true,
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
    response: Property.DynamicProperties({
      auth: ConnectorAuth.None(),
      displayName: 'Response',
      required: true,
      refreshers: ['mode'],
      props: async (propsValue) => {
        const mode = propsValue['mode'] as unknown as string;
        const fields: DynamicPropsValue = {};
        if (mode === 'simple') {
          fields['response'] = Property.Object({
            displayName: 'Response',
            required: true,
          });
        } else {
          fields['response'] = Property.Json({
            displayName: 'Response',
            required: true,
          });
        }
        return fields;
      },
    }),
  },
  async test(context) {
    return context.propsValue.response['response'];
  },
  async run(context) {
    const response = context.propsValue.response['response'];
    const callbackUrl = await context.store.get<string>(callableWorkflowKey(context.run.id), StoreScope.WORKFLOW);
    const isNotTestWorkflow = callbackUrl !== MOCK_CALLBACK_IN_TEST_WORKFLOW_URL;
    if (isNotTestWorkflow && !isNil(callbackUrl)) {
      await httpClient.sendRequest<CallableWorkflowResponse>({
        method: HttpMethod.POST,
        url: callbackUrl,
        body: {
          status: 'success',
          data: response
        },
        retries: 10,
      });
    }
    return response;
  },
});