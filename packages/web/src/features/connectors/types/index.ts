import { FlowComponentCategory } from '@fema-ipaas/component-sdk';
import {
  ActionBase,
  ErrorHandlingOptionsParam,
  ConnectorAuthProperty,
  ConnectorMetadataModelSummary,
  InputPropertyMap,
  TriggerBase,
} from '@fema-ipaas/connector-sdk';
import {
  WorkflowActionType,
  PackageType,
  ConnectorType,
  WorkflowTriggerType,
  WorkflowOperationType,
  StepLocationRelativeToParent,
} from '@fema-ipaas/shared';

type BaseStepMetadata = {
  displayName: string;
  logoUrl: string;
  description: string;
};

export type ConnectorStepMetadata = BaseStepMetadata & {
  type: WorkflowActionType.CONNECTOR | WorkflowTriggerType.CONNECTOR;
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
    | WorkflowActionType.CODE
    | WorkflowActionType.LOOP_ON_ITEMS
    | WorkflowActionType.ROUTER
    | WorkflowActionType.PARALLEL
    | WorkflowTriggerType.EMPTY;
};

export type ComponentStepMetadata = BaseStepMetadata & {
  type: WorkflowActionType.COMPONENT;
  componentType: string;
  category: FlowComponentCategory;
  icon: string;
  props: InputPropertyMap;
};

export type ConnectorStepMetadataWithSuggestions = ConnectorStepMetadata &
  Pick<ConnectorMetadataModelSummary, 'suggestedActions' | 'suggestedTriggers'>;

export type StepMetadataWithSuggestions =
  | ConnectorStepMetadataWithSuggestions
  | PrimitiveStepMetadata
  | ComponentStepMetadata;

export type CategorizedStepMetadataWithSuggestions = {
  title: string;
  metadata: StepMetadataWithSuggestions[];
};

export type StepMetadata =
  | ConnectorStepMetadata
  | PrimitiveStepMetadata
  | ComponentStepMetadata;

export type StepMetadataWithActionOrTriggerOrAgentDisplayName = StepMetadata & {
  actionOrTriggerOrAgentDisplayName: string;
  actionOrTriggerOrAgentDescription: string;
};

export type ConnectorSelectorOperation =
  | {
      type: WorkflowOperationType.ADD_ACTION;
      actionLocation: {
        branchIndex: number;
        parentStep: string;
        stepLocationRelativeToParent: StepLocationRelativeToParent.INSIDE_BRANCH;
      };
    }
  | {
      type: WorkflowOperationType.ADD_ACTION;
      actionLocation: {
        parentStep: string;
        stepLocationRelativeToParent: Exclude<
          StepLocationRelativeToParent,
          StepLocationRelativeToParent.INSIDE_BRANCH
        >;
      };
    }
  | { type: WorkflowOperationType.UPDATE_TRIGGER }
  | {
      type: WorkflowOperationType.UPDATE_ACTION;
      stepName: string;
    };

export type ConnectorSelectorConnectorItem =
  | {
      actionOrTrigger: TriggerBase;
      type: WorkflowTriggerType.CONNECTOR;
      connectorMetadata: ConnectorStepMetadata;
    }
  | ({
      actionOrTrigger: ActionBase;
      type: WorkflowActionType.CONNECTOR;
      connectorMetadata: ConnectorStepMetadata;
    } & {
      auth?: ConnectorAuthProperty;
    });

export type ConnectorSelectorItem =
  | ConnectorSelectorConnectorItem
  | PrimitiveStepMetadata
  | ComponentStepMetadata;

export type HandleSelectActionOrTrigger = (item: ConnectorSelectorItem) => void;
