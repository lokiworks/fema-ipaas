
import { createTrigger, Property, TriggerStrategy  } from '@fema-ipaas/connector-sdk';
import { MarkdownVariant } from '@fema-ipaas/connector-sdk';

export const manualTrigger = createTrigger({
name: 'manual_trigger',
classification: 'READ',
displayName: 'Manual Trigger',
description: 'Manually start your own workflow without any extra configurations',
aiMetadata: {
  description: 'Fires when a published workflow is started manually on demand, for example a user clicking Run Workflow, rather than in response to an external event; the event itself carries no payload. Use it as the entry point for workflows an operator or agent invokes directly, and prefer a webhook trigger for external app events, a schedule trigger for time-based runs, or the Web Form, Chat UI, or Callable Workflow triggers when the invoker must supply input.',
},
props: {
    markdown: Property.MarkDown({
        value: `Manual triggers are used to start a workflow on demand, publish your workflow and click (Run Workflow) at the start of the workflow.`,
        variant: MarkdownVariant.INFO,
    }),
},
sampleData: {},
type: TriggerStrategy.MANUAL,
async test() {
    return [{}];
},
async onEnable() {
    return void 0;
},
async onDisable() {
    return void 0;
},
async run() {
    return [{}]
},
});