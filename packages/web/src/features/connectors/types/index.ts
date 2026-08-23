import {
  ActionBase,
  ErrorHandlingOptionsParam,
  ConnectorAuthProperty,
  ConnectorMetadataModelSummary,
  TriggerBase,
} from '@fema/connector-sdk';
import {
  FlowActionType,
  PackageType,
  ConnectorType,
  FlowTriggerType,
  FlowOperationType,
  StepLocationRelativeToParent,
} from '@fema/shared';

type BaseStepMetadata = {
  displayName: string;
  logoUrl: string;
  description: string;
};

export type ConnectorStepMetadata = BaseStepMetadata & {
  type: FlowActionType.CONNECTOR | FlowTriggerType.CONNECTOR;
  connectorName: string;
  connectorVersion: string;
  categories: string[];
  packageType: PackageType;
  connectorType: ConnectorType;
  auth: ConnectorAuthProperty | ConnectorAuthProperty[] | undefined;
  errorHandlingOptions?: ErrorHandlingOptionsParam;
};

export type PrimitiveStepMetadata = BaseStepMetadata & {
  type:
    | FlowActionType.CODE
    | FlowActionType.LOOP_ON_ITEMS
    | FlowActionType.ROUTER
    | FlowTriggerType.EMPTY;
};

export type ConnectorStepMetadataWithSuggestions = ConnectorStepMetadata &
  Pick<ConnectorMetadataModelSummary, 'suggestedActions' | 'suggestedTriggers'>;

export type StepMetadataWithSuggestions =
  | ConnectorStepMetadataWithSuggestions
  | PrimitiveStepMetadata;

export type CategorizedStepMetadataWithSuggestions = {
  title: string;
  metadata: StepMetadataWithSuggestions[];
};

export type StepMetadata = ConnectorStepMetadata | PrimitiveStepMetadata;

export type StepMetadataWithActionOrTriggerOrAgentDisplayName = StepMetadata & {
  actionOrTriggerOrAgentDisplayName: string;
  actionOrTriggerOrAgentDescription: string;
};

export type ConnectorSelectorOperation =
  | {
      type: FlowOperationType.ADD_ACTION;
      actionLocation: {
        branchIndex: number;
        parentStep: string;
        stepLocationRelativeToParent: StepLocationRelativeToParent.INSIDE_BRANCH;
      };
    }
  | {
      type: FlowOperationType.ADD_ACTION;
      actionLocation: {
        parentStep: string;
        stepLocationRelativeToParent: Exclude<
          StepLocationRelativeToParent,
          StepLocationRelativeToParent.INSIDE_BRANCH
        >;
      };
    }
  | { type: FlowOperationType.UPDATE_TRIGGER }
  | {
      type: FlowOperationType.UPDATE_ACTION;
      stepName: string;
    };

export type ConnectorSelectorConnectorItem =
  | {
      actionOrTrigger: TriggerBase;
      type: FlowTriggerType.CONNECTOR;
      connectorMetadata: ConnectorStepMetadata;
    }
  | ({
      actionOrTrigger: ActionBase;
      type: FlowActionType.CONNECTOR;
      connectorMetadata: ConnectorStepMetadata;
    } & {
      auth?: ConnectorAuthProperty;
    });

export type ConnectorSelectorItem =
  | ConnectorSelectorConnectorItem
  | PrimitiveStepMetadata;

export type HandleSelectActionOrTrigger = (item: ConnectorSelectorItem) => void;
