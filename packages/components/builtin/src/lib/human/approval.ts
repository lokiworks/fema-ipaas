import { createComponent, ExecutionType, FlowComponentCategory } from '@fema-ipaas/component-sdk'

export const approvalComponent = createComponent({
    type: 'human/approval',
    displayName: 'Wait for Approval',
    description: 'Pause the workflow until a person approves or rejects it',
    category: FlowComponentCategory.HUMAN,
    icon: 'user-check',
    props: {},
    async run(context) {
        if (context.executionType === ExecutionType.RESUME) {
            return { approved: context.resumePayload?.queryParams[APPROVAL_QUERY_PARAM] === APPROVE_VALUE }
        }
        const waitpoint = await context.run.createWaitpoint({ type: 'WEBHOOK' })
        context.run.waitForWaitpoint(waitpoint.id)
        return { approved: false }
    },
})

export const approvalLinkComponent = createComponent({
    type: 'human/approval-link',
    displayName: 'Create Approval Links',
    description: 'Mint approve and reject links without pausing the workflow',
    category: FlowComponentCategory.HUMAN,
    icon: 'link',
    props: {},
    async run(context) {
        const waitpoint = await context.run.createWaitpoint({ type: 'WEBHOOK' })
        return {
            approvalLink: waitpoint.buildResumeUrl({ queryParams: { [APPROVAL_QUERY_PARAM]: APPROVE_VALUE }, sync: false }),
            disapprovalLink: waitpoint.buildResumeUrl({ queryParams: { [APPROVAL_QUERY_PARAM]: DISAPPROVE_VALUE }, sync: false }),
        }
    },
})

const APPROVAL_QUERY_PARAM = 'action'
const APPROVE_VALUE = 'approve'
const DISAPPROVE_VALUE = 'disapprove'
