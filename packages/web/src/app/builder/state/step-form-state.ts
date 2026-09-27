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
  };
};

export type ReferenceDrag = {
  sourceStepName: string;
  allowedStepNames: string[];
  insert: InsertMentionHandler;
  origin: { x: number; y: number };
};

export type ReferencePick = {
  targetStepName: string;
  insert: InsertMentionHandler;
};
