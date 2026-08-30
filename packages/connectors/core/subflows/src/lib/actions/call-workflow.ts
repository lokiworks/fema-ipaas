import {
  createAction,
  DynamicPropsValue,
  ConnectorAuth,
  Property,
} from '@fema-ipaas/connector-sdk';
import { ExecutionType, isNil } from '@fema-ipaas/connector-sdk';
import { CallableWorkflowResponse, dispatchToSubflow, findEnabledSubflowOrThrow, findWorkflowByExternalIdOrThrow, subflowDropdown } from '../common';

export const callWorkflow = createAction({
  audience: 'both',
  name: 'callWorkflow',
  classification: 'WRITE',
  displayName: 'Call Workflow',
  description: 'Call a workflow that has "Callable Workflow" trigger',
  aiMetadata: { description: 'Dispatches a run of another workflow in this project that starts with a "Callable Workflow" trigger, passing a payload entered as key-value pairs or raw JSON, and can optionally wait for that subflow to send back a "Return Response". Pick it to reuse a workflow as a subroutine; prefer Stream CSV to Subflows for large CSV input. The target workflow must be published and enabled, and when Wait for Response is on, a subflow failure also fails this run; not idempotent, since every call starts a new subflow run.', idempotent: false },
  props: {
    workflowId: subflowDropdown({
      displayName: 'Workflow',
      description: 'The workflow to execute. Published workflows with a "Callable Workflow" trigger appear here; disabled workflows are marked "(inactive)" and cannot be executed until they are enabled.',
    }),
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
    workflowProps: Property.DynamicProperties({
      auth: ConnectorAuth.None(),
      description: '',
      displayName: '',
      required: true,
      refreshers: ['workflowId', 'mode'],
      props: async (propsValue, context) => {
        const externalId = propsValue['workflowId'] as unknown as string;
        const mode = propsValue['mode'] as unknown as string;
        const fields: DynamicPropsValue = {};

        if (!isNil(externalId)) {
          const workflow = await findWorkflowByExternalIdOrThrow({
            workflowsContext: context.workflows,
            externalId,
          });
          const exampleData = workflow.version.trigger.settings.input.exampleData as unknown as { sampleData: object };

          if (mode === 'simple') {
            fields['payload'] = Property.Object({
              displayName: 'Payload',
              required: true,
              defaultValue: exampleData.sampleData,
            });
          }
          else{
            fields['payload'] = Property.Json({
              displayName: 'Payload',
              description:
                'Provide the data to be passed to the workflow',
              required: true,
              defaultValue: exampleData.sampleData,
            });
          }
        }
        return fields;
      },
    }),
    waitForResponse: Property.Checkbox({
      displayName: 'Wait for Response',
      required: false,
      defaultValue: false,
    }),
  },
  async run(context) {
    if (context.executionType === ExecutionType.RESUME) {
      const response = context.resumePayload.body as CallableWorkflowResponse;
      const shouldFailParentRun = response.status === 'error' && context.propsValue.waitForResponse
      if (shouldFailParentRun) {
        throw new Error(JSON.stringify(response.data, null, 2))
      }
      return {
        status: response.status,
        data: response.data
      }
    }
    const payload = context.propsValue.workflowProps['payload'];
    const workflow = await findEnabledSubflowOrThrow({
      workflowsContext: context.workflows,
      externalId: context.propsValue.workflowId,
    });

    let callbackUrl: string | undefined
    if (context.propsValue.waitForResponse) {
      const waitpoint = await context.run.createWaitpoint({
        type: 'WEBHOOK',
      });
      callbackUrl = waitpoint.buildResumeUrl({
        queryParams: {},
      });
      context.run.waitForWaitpoint(waitpoint.id);
    }

    return await dispatchToSubflow({
      apiUrl: context.server.apiUrl,
      workflowId: workflow.id,
      parentRunId: context.run.id,
      failParentOnFailure: context.propsValue.waitForResponse ?? false,
      data: payload,
      callbackUrl,
    });
  },
  errorHandlingOptions: {
    continueOnFailure: {
      defaultValue:false,
      hide:false,
    },
    retryOnFailure: {
      defaultValue:false,
      hide:false,
    }
  }
});
