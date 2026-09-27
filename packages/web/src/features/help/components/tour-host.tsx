import { t } from 'i18next';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { authenticationSession } from '@/lib/authentication-session';

import { helpStore } from '../lib/help-store';
import { TourId, tours } from '../lib/tours';
import {
  Rect,
  ResolvedTourStep,
  TourStatus,
  tourUtils,
} from '../utils/tour-utils';

export function launchTour(tourId: TourId): boolean {
  const steps = tourUtils.resolveSteps({
    steps: tours.steps(tourId),
    isVisible,
  });
  if (steps.length === 0) {
    toast.info(
      tourId === 'editor'
        ? t('Open a workflow you can edit, then start this tutorial again.')
        : t('There is nothing to show on this page.'),
    );
    return false;
  }
  helpStore.startTour({ tourId, steps });
  return true;
}

export function TourHost() {
  const { tourId, tourSteps, tourRequest } = helpStore.useHelpState();
  if (tourId === null || tourSteps.length === 0) {
    return null;
  }
  return <TourRunner key={tourRequest} tourId={tourId} steps={tourSteps} />;
}

function TourRunner({
  tourId,
  steps,
}: {
  tourId: TourId;
  steps: ResolvedTourStep[];
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState(readViewport);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = steps[index];

  useLayoutEffect(() => {
    const element = document.querySelector(tourUtils.selector(step.target));
    element?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const update = () => {
      const current = document.querySelector(tourUtils.selector(step.target));
      const box = current?.getBoundingClientRect();
      setRect(
        box && box.width > 0
          ? {
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
            }
          : null,
      );
      setViewport(readViewport());
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step.target]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        finish({ tourId, status: 'dismissed' });
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [tourId]);

  const cardSize = {
    width: CARD_WIDTH,
    height: cardRef.current?.offsetHeight ?? CARD_FALLBACK_HEIGHT,
  };
  const position = tourUtils.cardPosition({ rect, viewport, card: cardSize });
  const isLast = index === steps.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[1000]" role="presentation">
      {rect === null ? (
        <div className="absolute inset-0 bg-black/50" />
      ) : (
        <div
          className="pointer-events-none absolute rounded-md ring-2 ring-primary transition-all duration-200"
          style={{
            left: rect.left - HOLE_PADDING,
            top: rect.top - HOLE_PADDING,
            width: rect.width + HOLE_PADDING * 2,
            height: rect.height + HOLE_PADDING * 2,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
          }}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-label={step.title}
        className="absolute flex flex-col gap-2 rounded-lg border bg-background p-4 shadow-lg"
        style={{ left: position.left, top: position.top, width: CARD_WIDTH }}
      >
        <span className="text-xs text-muted-foreground">
          {tours.title(tourId)} · {index + 1} / {steps.length}
        </span>
        <span className="text-base font-semibold">{step.title}</span>
        <span className="text-sm text-muted-foreground">
          {step.description}
        </span>
        <div className="flex items-center gap-2 pt-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => finish({ tourId, status: 'dismissed' })}
          >
            {t('Exit tutorial')}
          </Button>
          <div className="ml-auto flex gap-2">
            {index > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIndex(index - 1)}
              >
                {t('Previous')}
              </Button>
            )}
            {isLast ? (
              <Button
                size="sm"
                onClick={() => {
                  finish({ tourId, status: 'completed' });
                  toast.success(t('Tutorial completed'));
                }}
              >
                {t('Done')}
              </Button>
            ) : (
              <Button size="sm" onClick={() => setIndex(index + 1)}>
                {t('Next')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function finish({ tourId, status }: { tourId: TourId; status: TourStatus }) {
  const userId = authenticationSession.getCurrentUserId();
  const storage = safeLocalStorage();
  if (userId && storage) {
    tourUtils.writeProgress({ storage, userId, tourId, status });
  }
  helpStore.endTour();
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isVisible(target: string): boolean {
  const element = document.querySelector(tourUtils.selector(target));
  if (element === null) {
    return false;
  }
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

function readViewport(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight };
}

const CARD_WIDTH = 320;
const CARD_FALLBACK_HEIGHT = 170;
const HOLE_PADDING = 6;
