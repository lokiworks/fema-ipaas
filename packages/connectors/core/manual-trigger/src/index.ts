
    import { createConnector, ConnectorAuth } from "@fema-ipaas/connector-sdk";
import { manualTrigger } from "./lib/triggers/manual-trigger";
import { ConnectorCategory } from "@fema-ipaas/connector-sdk";

export const manualTriggerConnector = createConnector({
      displayName: "Manual Trigger",
      description: "Start a workflow by hand, with no extra configuration",
      auth: ConnectorAuth.None(),
      minimumSupportedRelease: '0.78.0',
      logoUrl: "/assets/connectors/manual-trigger.svg",
      authors: ['AbdulTheActiveConnectorr'],
      actions: [],
      triggers: [manualTrigger],
      categories:[ConnectorCategory.CORE]
    });
    