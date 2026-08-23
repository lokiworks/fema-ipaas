import { FAIL_PARENT_ON_FAILURE_HEADER, WorkflowStatus, WorkflowTriggerType, isNil, PARENT_RUN_ID_HEADER, ConnectorAuth, PopulatedWorkflow, Property } from "@fema/connector-sdk";
import { WorkflowsContext, ListWorkflowsContextParams } from "@fema/connector-sdk";
import { httpClient, HttpMethod } from "@fema/connector-common";


export const callableWorkflowKey = (runId: string) => `callableWorkflow_${runId}`;

export type CallableWorkflowRequest = {
    data: unknown;
    callbackUrl: string;
}
export type CallableWorkflowResponse = {
    status: 'success' | 'error';
    data: unknown;
}

export const MOCK_CALLBACK_IN_TEST_WORKFLOW_URL = 'MOCK';

export async function listWorkflowsWithSubflowTrigger({
    workflowsContext,
    params,
}: ListParams): Promise<PopulatedWorkflow[]> {
    // The framework context types this leanly as PopulatedWorkflowSummary, but the
    // engine returns full PopulatedWorkflow records (with version) at runtime.
    const allWorkflows = (await workflowsContext.list(params)).data as unknown as PopulatedWorkflow[];
    const workflows = allWorkflows.filter(
        (workflow) =>
            workflow.version.trigger.type === WorkflowTriggerType.CONNECTOR &&
            workflow.version.trigger.settings.connectorName ==
            '@fema/connector-subflows'
    );
    return workflows;
}

export async function findWorkflowByExternalIdOrThrow({
    workflowsContext,
    externalId,
}: {
    workflowsContext: WorkflowsContext;
    externalId: string | undefined;
}): Promise<PopulatedWorkflow> {
    if (isNil(externalId)) {
        throw new Error(JSON.stringify({
            message: 'Please select a workflow',
        }));
    }
    const externalIds = [externalId];
    const allWorkflows = await listWorkflowsWithSubflowTrigger({
        workflowsContext,
        params: {
            externalIds
        }
    });
    if (allWorkflows.length === 0) {
        throw new Error(JSON.stringify({
            message: 'Workflow not found',
            externalId,
        }));
    }
    return allWorkflows[0];
}

export async function findEnabledSubflowOrThrow({
    workflowsContext,
    externalId,
}: {
    workflowsContext: WorkflowsContext;
    externalId: string | undefined;
}): Promise<PopulatedWorkflow> {
    const workflow = await findWorkflowByExternalIdOrThrow({ workflowsContext, externalId });
    if (workflow.status !== WorkflowStatus.ENABLED) {
        throw new Error(JSON.stringify({
            message: 'The selected subflow is disabled. Enable it before calling it from a parent workflow.',
            externalId,
            workflowName: workflow.version.displayName,
        }));
    }
    return workflow;
}

export function subflowDropdown({
    displayName,
    description,
}: {
    displayName: string;
    description: string;
}) {
    return Property.Dropdown<string>({
        auth: ConnectorAuth.None(),
        displayName,
        description,
        required: true,
        refreshers: [],
        options: async (_, context) => {
            const workflows = await listWorkflowsWithSubflowTrigger({
                workflowsContext: context.workflows,
            });
            return {
                options: workflows.map((workflow) => ({
                    value: workflow.externalId ?? workflow.id,
                    label:
                        workflow.status === WorkflowStatus.ENABLED
                            ? workflow.version.displayName
                            : `${workflow.version.displayName} (inactive)`,
                })),
            };
        },
    });
}

export async function dispatchToSubflow({
    apiUrl,
    workflowId,
    parentRunId,
    failParentOnFailure,
    data,
    callbackUrl,
    retries,
}: DispatchToSubflowParams): Promise<unknown> {
    const response = await httpClient.sendRequest({
        method: HttpMethod.POST,
        url: `${apiUrl.replace(/\/$/, '')}/v1/webhooks/${workflowId}`,
        headers: {
            'Content-Type': 'application/json',
            [PARENT_RUN_ID_HEADER]: parentRunId,
            [FAIL_PARENT_ON_FAILURE_HEADER]: failParentOnFailure ? 'true' : 'false',
        },
        body: {
            data,
            callbackUrl,
        },
        retries,
    });
    return response.body;
}

type ListParams = {
    workflowsContext: WorkflowsContext,
    params?: ListWorkflowsContextParams
}

type DispatchToSubflowParams = {
    apiUrl: string;
    workflowId: string;
    parentRunId: string;
    failParentOnFailure: boolean;
    data: unknown;
    callbackUrl?: string;
    retries?: number;
}