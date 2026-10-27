import { isNil } from '@fema-ipaas/core-utils';
import { useReactFlow } from '@xyflow/react';
import { t } from 'i18next';
import { useEffect, useRef, useState } from 'react';

import { BUILDER_CONTENT_ID } from '@/app/components/builder-layout';

import { useBuilderStateContext } from '../../../builder-hooks';
import { NoteDragOverlayMode } from '../../../state/notes-state';
import {
  useCursorPosition,
  useCursorPositionEffect,
} from '../../cursor-position-context';
import { workflowCanvasConsts } from '../../utils/consts';

import { NoteContent } from '.';

const NoteDragOverlay = () => {
  const { cursorPosition } = useCursorPosition();
  const [overlayPosition, setOverlayPosition] =
    useState<typeof cursorPosition>(cursorPosition);
  const [
    draggedNote,
    noteDragOverlayMode,
    addNote,
    draggedNoteOffset,
    setDraggedNote,
  ] = useBuilderStateContext((state) => [
    state.draggedNote,
    state.noteDragOverlayMode,
    state.addNote,
    state.draggedNoteOffset,
    state.setDraggedNote,
  ]);
  const isCreating = noteDragOverlayMode === NoteDragOverlayMode.CREATE;
  useEffect(() => {
    if (!isCreating) {
      return;
    }
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setDraggedNote(null, null);
      }
    };
    window.addEventListener('keydown', cancelOnEscape);
    return () => window.removeEventListener('keydown', cancelOnEscape);
  }, [isCreating, setDraggedNote]);
  const reactFlow = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);
  const sidebarWidth =
    document.getElementById(BUILDER_CONTENT_ID)?.getBoundingClientRect().left ??
    0;

  const nodeSizeWithZoom = {
    width: (draggedNote?.size.width ?? 0) * reactFlow.getZoom(),
    height: (draggedNote?.size.height ?? 0) * reactFlow.getZoom(),
  };

  const offsetX = draggedNoteOffset
    ? draggedNoteOffset.x
    : nodeSizeWithZoom.width / 2;
  const offsetY = draggedNoteOffset
    ? draggedNoteOffset.y
    : nodeSizeWithZoom.height / 2;

  const left = `${overlayPosition.x - offsetX - sidebarWidth}px`;
  const top = `${
    overlayPosition.y - offsetY - workflowCanvasConsts.BUILDER_HEADER_HEIGHT
  }px`;
  useCursorPositionEffect((position) => {
    setOverlayPosition(position);
  });
  const hideOverlay = isNil(draggedNote) || isNil(noteDragOverlayMode);

  if (hideOverlay) {
    return null;
  }
  return (
    <>
      {isCreating && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-[60] -translate-x-1/2 rounded-md bg-foreground/85 px-3 py-1.5 text-xs text-background shadow-md">
          {t('Click to place the note. Press Esc or right-click to cancel.')}
        </div>
      )}
      <div
        className={'absolute !cursor-grabbing note-drag-overlay'}
        ref={containerRef}
        onContextMenuCapture={(event) => {
          if (isCreating) {
            event.preventDefault();
            event.stopPropagation();
            setDraggedNote(null, null);
          }
        }}
        onClick={() => {
          if (noteDragOverlayMode === NoteDragOverlayMode.CREATE) {
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) {
              const positionOnCanvas = reactFlow.screenToFlowPosition({
                x: rect.left,
                y: rect.top,
              });
              addNote({
                content: workflowCanvasConsts.DEFAULT_NOTE_CONTENT,
                position: positionOnCanvas,
                size: draggedNote.size,
                color: workflowCanvasConsts.DEFAULT_NOTE_COLOR,
              });
            }
          }
        }}
        style={{
          left,
          top,
          height: `${draggedNote.size.height}px`,
          width: `${draggedNote.size.width}px`,
          transform: `scale(${reactFlow.getZoom()})`,
          transformOrigin: '0 0',
        }}
      >
        <NoteContent
          isDragging={true}
          note={{
            ...draggedNote,
          }}
        ></NoteContent>
      </div>
    </>
  );
};

export default NoteDragOverlay;
