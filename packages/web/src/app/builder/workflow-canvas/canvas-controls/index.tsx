import { tryCatch } from '@fema-ipaas/core-utils';
import { useKeyPress, useReactFlow } from '@xyflow/react';
import { t } from 'i18next';
import {
  Fullscreen,
  GalleryHorizontalEnd,
  GalleryVerticalEnd,
  Hand,
  ImageDown,
  LoaderCircle,
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

  const handleToggleOrientation = () => {
    const newOrientation =
      canvasOrientation === 'horizontal' ? 'vertical' : 'horizontal';
    setCanvasOrientation(newOrientation);
    // the canvas remounts when the orientation changes, give it a frame to sync nodes before fitting
    setTimeout(
      () =>
        handleFitToView({
          isInitialRenderCall: false,
          orientation: newOrientation,
        }),
      100,
    );
  };

  const handleCreateNote = () => {
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
  const noteLabel = t('Add note');

  return (
    <div
      id="canvas-controls"
      className={cn(
        'z-50 absolute bottom-2 left-0 flex items-center w-full pointer-events-none',
        compact && 'justify-between gap-2 px-2',
        tiny && 'justify-center',
      )}
    >
      {!tiny && (
        <div
          className={cn(
            'flex items-center justify-center gap-1 p-1.5 pointer-events-auto rounded-lg bg-background border border-sidebar-border',
            compact ? 'shrink-0' : 'absolute ml-2',
          )}
        >
          <CanvasControlButton
            tooltip={t('Minimap' + (isMac() ? ' (⌘ + M)' : ' (Ctrl + M)'))}
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
      {!compact && <div className="grow"></div>}

      <div
        className={cn(
          'bg-background gap-2 flex items-center shadow-2xl justify-center border border-sidebar-border p-1.5 rounded-lg pointer-events-auto',
          compact && 'min-w-0 gap-1',
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
          <>
            <CanvasControlButton
              tooltip={fullScreenLabel}
              icon={Maximize}
              onClick={toggleFullScreen}
            />
            <CanvasControlButton
              tooltip={downloadLabel}
              icon={isCapturingImage ? LoaderCircle : ImageDown}
              iconClassName={isCapturingImage ? 'animate-spin' : undefined}
              disabled={isCapturingImage}
              onClick={handleDownloadWorkflowAsImage}
            />
            <CanvasControlButton
              tooltip={orientationLabel}
              icon={isHorizontal ? GalleryVerticalEnd : GalleryHorizontalEnd}
              onClick={handleToggleOrientation}
            />
          </>
        )}
        <div>
          <Separator orientation="vertical" className="h-5"></Separator>
        </div>
        <CanvasControlButton
          tooltip={t('Grab mode')}
          icon={Hand}
          active={isInGrabMode}
          onClick={() => setPanningMode('grab')}
        />
        <CanvasControlButton
          tooltip={t('Select mode')}
          icon={MousePointer}
          active={!isInGrabMode}
          onClick={() => setPanningMode('pan')}
        />
        {!compact && !readonly && (
          <CanvasControlButton
            tooltip={noteLabel}
            icon={StickyNote}
            active={noteDragOverlayMode === NoteDragOverlayMode.CREATE}
            onClick={handleCreateNote}
          />
        )}
        {compact && (
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
                  <DropdownMenuItem
                    onSelect={() => setShowMinimap(!showMinimap)}
                  >
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
              <DropdownMenuItem onSelect={toggleFullScreen}>
                <Maximize className="size-4" />
                {fullScreenLabel}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={isCapturingImage}
                onSelect={handleDownloadWorkflowAsImage}
              >
                <ImageDown className="size-4" />
                {downloadLabel}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleToggleOrientation}>
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
        )}
      </div>
      {!compact && <div className="grow"></div>}
    </div>
  );
};

function toggleFullScreen() {
  if (document.fullscreenElement) {
    void document.exitFullscreen();
    return;
  }
  void document.documentElement.requestFullscreen();
}

const COMPACT_CANVAS_PX = 760;
const TINY_CANVAS_PX = 460;

export { CanvasControls };
