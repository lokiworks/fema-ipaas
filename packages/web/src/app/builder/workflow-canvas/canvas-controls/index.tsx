import { tryCatch } from '@fema-ipaas/core-utils';
import { useKeyPress, useReactFlow } from '@xyflow/react';
import { t } from 'i18next';
import {
  Fullscreen,
  GalleryHorizontalEnd,
  GalleryVerticalEnd,
  Hand,
  ImageDown,
  Map,
  Maximize,
  Minus,
  MoreHorizontal,
  MousePointer,
  Plus,
  Redo2,
  StickyNote,
  Undo2,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { isMac } from '@/lib/dom-utils';
import { cn } from '@/lib/utils';

import { useBuilderStateContext } from '../../builder-hooks';
import { NoteDragOverlayMode } from '../../state/notes-state';
import { workflowCanvasConsts } from '../utils/consts';
import { workflowScreenshotUtils } from '../utils/workflow-screenshot-utils';

import { CanvasControlButton } from './canvas-control-button';
import { useFitToView } from './use-fit-to-view';
import { ZoomMenu } from './zoom-menu';

const CanvasControls = ({
  canvasWidth,
  canvasHeight,
  hasCanvasBeenInitialised,
  selectedStep,
}: {
  canvasWidth: number;
  canvasHeight: number;
  hasCanvasBeenInitialised: boolean;
  selectedStep: string | null;
}) => {
  const { zoomIn, zoomOut, zoomTo, getNodes } = useReactFlow();
  const { handleFitToView } = useFitToView({
    canvasWidth,
    canvasHeight,
    hasCanvasBeenInitialised,
    selectedStep,
  });

  const canvasOrientation = useBuilderStateContext(
    (state) => state.canvasOrientation,
  );
  const [noteDragOverlayMode, setDraggedNote] = useBuilderStateContext(
    (state) => [state.noteDragOverlayMode, state.setDraggedNote],
  );
  const [undo, redo, canUndo, canRedo] = useBuilderStateContext((state) => [
    state.undo,
    state.redo,
    state.history.past.length > 0,
    state.history.future.length > 0,
  ]);
  const [
    setPanningMode,
    panningMode,
    showMinimap,
    setShowMinimap,
    readonly,
    setCanvasOrientation,
    workflowDisplayName,
  ] = useBuilderStateContext((state) => {
    return [
      state.setPanningMode,
      state.panningMode,
      state.showMinimap,
      state.setShowMinimap,
      state.readonly,
      state.setCanvasOrientation,
      state.workflowVersion.displayName,
    ];
  });

  const [isCapturingImage, setIsCapturingImage] = useState(false);
  const handleDownloadWorkflowAsImage = async () => {
    setIsCapturingImage(true);
    const { error } = await tryCatch(() =>
      workflowScreenshotUtils.downloadWorkflowAsImage({
        nodes: getNodes(),
        workflowName: workflowDisplayName,
      }),
    );
    if (error) {
      console.error(error);
      toast.error(t('Failed to capture the workflow image'));
    }
    setIsCapturingImage(false);
  };

  const handleToggleOrientation = async () => {
    const newOrientation =
      canvasOrientation === 'horizontal' ? 'vertical' : 'horizontal';
    const expectedNodeCount = getNodes().length;
    setCanvasOrientation(newOrientation);
    await waitForNodes({ getNodes, expectedNodeCount });
    handleFitToView({
      isInitialRenderCall: false,
      orientation: newOrientation,
    });
  };

  const handleCreateNote = () => {
    if (noteDragOverlayMode === NoteDragOverlayMode.CREATE) {
      setDraggedNote(null, null);
      return;
    }
    setDraggedNote(
      {
        id: '',
        content: '',
        createdAt: '',
        updatedAt: '',
        position: { x: 0, y: 0 },
        size: {
          width: workflowCanvasConsts.NOTE_CREATION_OVERLAY_WIDTH,
          height: workflowCanvasConsts.NOTE_CREATION_OVERLAY_HEIGHT,
        },
        color: workflowCanvasConsts.DEFAULT_NOTE_COLOR,
      },
      NoteDragOverlayMode.CREATE,
    );
  };

  const spacePressed = useKeyPress('Space');
  const shiftPressed = useKeyPress('Shift');
  const isInGrabMode =
    (spacePressed || panningMode === 'grab') && !shiftPressed;
  const isHorizontal = canvasOrientation === 'horizontal';

  const compact = canvasWidth > 0 && canvasWidth < COMPACT_CANVAS_PX;
  const tiny = canvasWidth > 0 && canvasWidth < TINY_CANVAS_PX;
  const fullScreenLabel = t('Full screen');
  const downloadLabel = t('Download as image');
  const orientationLabel = isHorizontal
    ? t('Vertical layout')
    : t('Horizontal layout');
  const noteLabel =
    noteDragOverlayMode === NoteDragOverlayMode.CREATE
      ? t('Cancel adding note')
      : t('Add note');

  return (
    <div
      id="canvas-controls"
      className={cn(
        'z-50 absolute bottom-3 left-0 flex w-full items-center justify-between gap-2 px-3 pointer-events-none',
        tiny && 'justify-center',
      )}
    >
      {!tiny && (
        <div
          className={cn(
            'flex shrink-0 items-center justify-center gap-0.5 p-1 pointer-events-auto rounded-lg bg-background border shadow-sm',
          )}
        >
          <CanvasControlButton
            tooltip={t('minimapTooltip', {
              shortcut: isMac() ? '⌘ + M' : 'Ctrl + M',
            })}
            tooltipSide="right"
            icon={Map}
            active={showMinimap}
            onClick={() => setShowMinimap(!showMinimap)}
          />
          {!readonly && (
            <>
              <CanvasControlButton
                tooltip={`${t('Undo')} (${isMac() ? '⌘Z' : 'Ctrl+Z'})`}
                icon={Undo2}
                disabled={!canUndo}
                onClick={undo}
              />
              <CanvasControlButton
                tooltip={`${t('Redo')} (${isMac() ? '⇧⌘Z' : 'Ctrl+Shift+Z'})`}
                icon={Redo2}
                disabled={!canRedo}
                onClick={redo}
              />
            </>
          )}
        </div>
      )}
      <div
        className={cn(
          'bg-background gap-0.5 flex min-w-0 items-center justify-center border p-1 rounded-lg shadow-sm pointer-events-auto',
        )}
        data-testid="canvas-controls-main"
      >
        <CanvasControlButton
          tooltip={t('Zoom in')}
          icon={Plus}
          onClick={() => zoomIn({ duration: 0 })}
        />
        <CanvasControlButton
          tooltip={t('Zoom out')}
          icon={Minus}
          onClick={() => zoomOut({ duration: 0 })}
        />
        <ZoomMenu
          onFitToView={() => handleFitToView({ isInitialRenderCall: false })}
          onReset={() => {
            zoomTo(1, { duration: 0 });
            handleFitToView({ isInitialRenderCall: false });
          }}
        />
        <CanvasControlButton
          tooltip={t('Fit to view')}
          icon={Fullscreen}
          onClick={() => handleFitToView({ isInitialRenderCall: false })}
        />
        {!compact && (
          <CanvasControlButton
            tooltip={fullScreenLabel}
            icon={Maximize}
            onClick={toggleFullScreen}
          />
        )}
        <div>
          <Separator orientation="vertical" className="h-5"></Separator>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('More canvas tools')}
              data-testid="canvas-controls-more"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top">
            {tiny && (
              <>
                <DropdownMenuItem onSelect={() => setShowMinimap(!showMinimap)}>
                  <Map className="size-4" />
                  {t('Minimap')}
                </DropdownMenuItem>
                {!readonly && (
                  <>
                    <DropdownMenuItem disabled={!canUndo} onSelect={undo}>
                      <Undo2 className="size-4" />
                      {t('Undo')}
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!canRedo} onSelect={redo}>
                      <Redo2 className="size-4" />
                      {t('Redo')}
                    </DropdownMenuItem>
                  </>
                )}
              </>
            )}
            {compact && (
              <DropdownMenuItem onSelect={toggleFullScreen}>
                <Maximize className="size-4" />
                {fullScreenLabel}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() => setPanningMode(isInGrabMode ? 'pan' : 'grab')}
            >
              {isInGrabMode ? (
                <MousePointer className="size-4" />
              ) : (
                <Hand className="size-4" />
              )}
              {isInGrabMode ? t('Select mode') : t('Grab mode')}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isCapturingImage}
              onSelect={handleDownloadWorkflowAsImage}
            >
              <ImageDown className="size-4" />
              {downloadLabel}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void handleToggleOrientation()}>
              {isHorizontal ? (
                <GalleryVerticalEnd className="size-4" />
              ) : (
                <GalleryHorizontalEnd className="size-4" />
              )}
              {orientationLabel}
            </DropdownMenuItem>
            {!readonly && (
              <DropdownMenuItem onSelect={handleCreateNote}>
                <StickyNote className="size-4" />
                {noteLabel}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

function waitForNodes({
  getNodes,
  expectedNodeCount,
}: {
  getNodes: () => unknown[];
  expectedNodeCount: number;
}): Promise<void> {
  return new Promise((resolve) => {
    const startedAt = performance.now();
    const check = () => {
      const synced = getNodes().length >= expectedNodeCount;
      const timedOut = performance.now() - startedAt > NODES_SYNC_TIMEOUT_MS;
      if (synced || timedOut) {
        requestAnimationFrame(() => resolve());
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(() => requestAnimationFrame(check));
  });
}

function toggleFullScreen() {
  if (document.fullscreenElement) {
    void document.exitFullscreen();
    return;
  }
  void document.documentElement.requestFullscreen();
}

const NODES_SYNC_TIMEOUT_MS = 3000;
const COMPACT_CANVAS_PX = 760;
const TINY_CANVAS_PX = 460;

export { CanvasControls };
