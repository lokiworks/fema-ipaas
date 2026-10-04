import { StoreApi } from 'zustand';

import { BuilderState } from '../builder-hooks';

type InsertMentionHandler = (propertyPath: string) => void;
export type StepFormState = {
  insertMention: InsertMentionHandler | null;
  setInsertMentionHandler: (handler: InsertMentionHandler | null) => void;
  isFocusInsideListMapperModeInput: boolean;
  setIsFocusInsideListMapperModeInput: (
    isFocusInsideListMapperModeInput: boolean,
  ) => void;
  dataSelectorRequestNonce: number;
  requestDataSelector: () => void;
  referenceDrag: ReferenceDrag | null;
  setReferenceDrag: (drag: ReferenceDrag | null) => void;
  referencePick: ReferencePick | null;
  setReferencePick: (pick: ReferencePick | null) => void;
  embeddedDataSelectorCount: number;
  registerEmbeddedDataSelector: () => () => void;
  expandedMappingEditor: ExpandedMappingEditor | null;
  setExpandedMappingEditor: (expanded: ExpandedMappingEditor | null) => void;
};

export const createStepFormState = (
  set: StoreApi<BuilderState>['setState'],
): StepFormState => {
  return {
    setInsertMentionHandler: (insertMention: InsertMentionHandler | null) => {
      set({ insertMention });
    },
    insertMention: null,
    isFocusInsideListMapperModeInput: false,
    setIsFocusInsideListMapperModeInput: (
      isFocusInsideListMapperModeInput: boolean,
    ) => {
      return set(() => ({
        isFocusInsideListMapperModeInput,
      }));
    },
    dataSelectorRequestNonce: 0,
    requestDataSelector: () =>
      set((state) => ({
        dataSelectorRequestNonce: state.dataSelectorRequestNonce + 1,
      })),
    referenceDrag: null,
    setReferenceDrag: (referenceDrag: ReferenceDrag | null) =>
      set({ referenceDrag }),
    referencePick: null,
    setReferencePick: (referencePick: ReferencePick | null) =>
      set({ referencePick }),
    expandedMappingEditor: null,
    setExpandedMappingEditor: (expandedMappingEditor) =>
      set({ expandedMappingEditor }),
    embeddedDataSelectorCount: 0,
    registerEmbeddedDataSelector: () => {
      set((state) => ({
        embeddedDataSelectorCount: state.embeddedDataSelectorCount + 1,
      }));
      return () =>
        set((state) => ({
          embeddedDataSelectorCount: state.embeddedDataSelectorCount - 1,
        }));
    },
  };
};

export type ExpandedMappingEditor = {
  stepName: string;
  versionId: string;
};

export type ReferenceDrag = {
  sourceStepName: string;
  allowedStepNames: string[];
  insert: InsertMentionHandler;
  origin: { x: number; y: number };
};

export type ReferencePick = {
  targetStepName: string | null;
  candidateStepNames: string[];
  insert: InsertMentionHandler;
};
