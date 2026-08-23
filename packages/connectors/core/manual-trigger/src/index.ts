
    import { createConnector, ConnectorAuth } from "@fema/connector-sdk";
import { manualTrigger } from "./lib/triggers/manual-trigger";
import { ConnectorCategory } from "@fema/connector-sdk";

export const manualTriggerConnector = createConnector({
      displayName: "Manual Trigger",
      auth: ConnectorAuth.None(),
      minimumSupportedRelease: '0.78.0',
      logoUrl: "https://cdn.fema.local/connectors/new-core/manual-trigger.svg",
      authors: ['AbdulTheActiveConnectorr'],
      actions: [],
      triggers: [manualTrigger],
      categories:[ConnectorCategory.CORE]
    });
    