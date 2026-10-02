import { useCallback, useEffect } from 'react';

import { isEditableTarget } from '@/lib/dom-utils';

import { useBuilderStateContext } from './builder-hooks';
import { CanvasShortcutsProps } from './workflow-canvas/context-menu/canvas-context-menu';
import { canvasBulkActions } from './workflow-canvas/utils/bulk-actions';
import { workflowCanvasConsts } from './workflow-canvas/utils/consts';
import { pasteLocationUtils } from './workflow-canvas/utils/paste-location';

export const useHandleKeyPressOnCanvas = () => {
  const [
    selectedNodes,
    workflowVersion,
    selectedStep,
    exitStepSettings,
    applyOperation,
    applyOperations,
    readonly,
    setShowMinimap,
    showMinimap,
    setDraggedNote,
    setDraggedStep,
    setSelectedNodes,
    undo,
    redo,
    setHighlightedSteps,
  ] = useBuilderStateContext((state) => [
    state.selectedNodes,
    state.workflowVersion,
    state.selectedStep,
    state.exitStepSettings,
    state.applyOperation,
    state.applyOperations,
    state.readonly,
    state.setShowMinimap,
    state.showMinimap,
    state.setDraggedNote,
    state.setActiveDraggingStep,
    state.setSelectedNodes,
    state.undo,
    state.redo,
    state.setHighlightedSteps,
  ]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) {
        return;
      }
      const insideSelectionRect =
        e.target instanceof HTMLElement &&
        e.target.classList.contains(
          workflowCanvasConsts.NODE_SELECTION_RECT_CLASS_NAME,
        );
      const insideStep =
        e.target instanceof HTMLElement &&
        e.target.closest(
          `[data-${workflowCanvasConsts.STEP_CONTEXT_MENU_ATTRIBUTE}]`,
        );
      const insideBody = e.target === document.body;
      const onCanvas = insideSelectionRect || !!insideStep || insideBody;
      const selectedNodesWithoutTrigger = selectedNodes.filter(
        (node) => node !== workflowVersion.trigger.name,
      );

      shortcutHandler(e, {
        Minimap: () => {
          setShowMinimap(!showMinimap);
        },
        Copy: () => {
          if (
            selectedNodesWithoutTrigger.length > 0 &&
            document.getSelection()?.toString() === ''
          ) {
            e.stopPropagation();
            e.preventDefault();

            void canvasBulkActions.copySelectedNodes({
              selectedNodes: selectedNodesWithoutTrigger,
              workflowVersion,
            });
          }
        },
        Cut: () => {
          if (
            readonly ||
            !onCanvas ||
            selectedNodesWithoutTrigger.length === 0 ||
            document.getSelection()?.toString() !== ''
          ) {
            return;
          }
          e.stopPropagation();
          e.preventDefault();
          void canvasBulkActions.cutSelectedNodes({
            selectedNodes: selectedNodesWithoutTrigger,
            workflowVersion,
            applyOperation,
            selectedStep,
            exitStepSettings,
          });
        },
        Delete: () => {
          if (readonly || !onCanvas) {
            return;
          }
          if (selectedNodesWithoutTrigger.length > 0) {
            e.stopPropagation();
            e.preventDefault();
            canvasBulkActions.requestNodeDeletion({
              exitStepSettings,
              selectedStep,
              selectedNodes: selectedNodesWithoutTrigger,
              applyOperation,
              workflowVersion,
            });
          }
        },
        Skip: () => {
          if (readonly || !onCanvas) {
            return;
          }
          if (selectedNodesWithoutTrigger.length > 0) {
            canvasBulkActions.toggleSkipSelectedNodes({
              selectedNodes: selectedNodesWithoutTrigger,
              workflowVersion,
              applyOperation,
            });
          }
        },
        ExitDrag: () => {
          setDraggedNote(null, null);
          setDraggedStep(null);
          if (selectedStep) {
            exitStepSettings();
          }
          setSelectedNodes([]);
          setHighlightedSteps([]);
        },
        Undo: () => {
          if (readonly || !onCanvas) {
            return;
          }
          e.preventDefault();
          undo();
        },
        Redo: () => {
          if (readonly || !onCanvas) {
            return;
          }
          e.preventDefault();
          redo();
        },
        Paste: () => {
          if (readonly || !onCanvas) {
            return;
          }
          e.stopPropagation();
          e.preventDefault();
          const lastSelectedNode =
            selectedNodes.length === 1 ? selectedNodes[0] : null;
          const location = pasteLocationUtils.after(
            lastSelectedNode ??
              canvasBulkActions.getLastStepName(workflowVersion),
          );
          void canvasBulkActions.pasteNodes({
            workflowVersion,
            location,
            applyOperations,
          });
        },
      });
    },
    [
      selectedNodes,
      workflowVersion,
      applyOperation,
      applyOperations,
      selectedStep,
      exitStepSettings,
      readonly,
      setShowMinimap,
      showMinimap,
      setDraggedNote,
      setDraggedStep,
      setSelectedNodes,
      undo,
      redo,
      setHighlightedSteps,
    ],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
};

const shortcutHandler = (
  event: KeyboardEvent,
  handlers: Record<keyof CanvasShortcutsProps, () => void>,
) => {
  const key = event.key === 'Backspace' ? 'Delete' : event.key;
  const shortcutActivated = SHORTCUT_NAMES.find((name) => {
    const shortcut = CanvasShortcuts[name];
    return (
      shortcut.shortcutKey?.toLowerCase() === key.toLowerCase() &&
      !!shortcut.withCtrl === (event.ctrlKey || event.metaKey) &&
      !!shortcut.withShift === event.shiftKey
    );
  });
  if (shortcutActivated) {
    handlers[shortcutActivated]();
  }
};

export const CanvasShortcuts: CanvasShortcutsProps = {
  ExitDrag: {
    withCtrl: false,
    withShift: false,
    shortcutKey: 'Escape',
  },
  Minimap: {
    withCtrl: true,
    withShift: false,
    shortcutKey: 'm',
  },
  Paste: {
    withCtrl: true,
    withShift: false,
    shortcutKey: 'v',
  },
  Delete: {
    withCtrl: false,
    withShift: false,
    shortcutKey: 'Delete',
  },
  Copy: {
    withCtrl: true,
    withShift: false,
    shortcutKey: 'c',
  },
  Cut: {
    withCtrl: true,
    withShift: false,
    shortcutKey: 'x',
  },
  Skip: {
    withCtrl: true,
    withShift: false,
    shortcutKey: 'e',
  },
  Undo: {
    withCtrl: true,
    withShift: false,
    shortcutKey: 'z',
  },
  Redo: {
    withCtrl: true,
    withShift: true,
    shortcutKey: 'z',
  },
};

const SHORTCUT_NAMES: (keyof CanvasShortcutsProps)[] = [
  'ExitDrag',
  'Minimap',
  'Paste',
  'Delete',
  'Copy',
  'Cut',
  'Skip',
  'Undo',
  'Redo',
];
