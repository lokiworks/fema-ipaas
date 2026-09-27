import { t } from 'i18next';
import { Check, ChevronRight, Compass } from 'lucide-react';
import React, { useState } from 'react';

import { MessageTooltip } from '@/components/custom/message-tooltip';
import { Button } from '@/components/ui/button';
import { NewProjectDialog } from '@/features/projects';
import { authenticationSession } from '@/lib/authentication-session';
import { BrowserStorage } from '@/lib/browser-storage';
import { cn } from '@/lib/utils';

export function HomeOnboardingCard({
  productName,
  hasProject,
  hasWorkflow,
  canCreateWorkflow,
  onProjectCreated,
  onNewWorkflow,
  onStartTour,
}: {
  productName: string;
  hasProject: boolean;
  hasWorkflow: boolean;
  canCreateWorkflow: boolean;
  onProjectCreated: () => void;
  onNewWorkflow: () => void;
  onStartTour: () => void;
}) {
  const [dismissed, setDismissed] = useState(readDismissed);
  if (dismissed) {
    return null;
  }
  return (
    <section
      data-tour="home-start"
      className="flex flex-col gap-4 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-background p-5 md:flex-row md:items-center md:gap-6"
    >
      <div className="flex flex-1 flex-col gap-1">
        <span className="text-base font-bold">
          {t('Welcome to {productName}', { productName })}
        </span>
        <span className="text-sm text-muted-foreground">
          {t(
            'Two steps to your first automation: create a project, then create a workflow in it.',
          )}
        </span>
        <div className="flex gap-2 pt-3">
          <Button size="sm" onClick={onStartTour}>
            <Compass className="size-4" />
            {t('Start the guided tour')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDismissed(markDismissed())}
          >
            {t('Skip for now')}
          </Button>
        </div>
      </div>
      <div className="flex w-full flex-col gap-2 md:w-96">
        <NewProjectDialog onCreate={onProjectCreated}>
          <OnboardingStep
            index={1}
            done={hasProject}
            title={t('Create a project')}
            description={t(
              'Split by business line or team; permissions are isolated between projects',
            )}
          />
        </NewProjectDialog>
        <MessageTooltip
          isDisabled={!canCreateWorkflow}
          message="You have no editable project yet. Create a project first."
        >
          <OnboardingStep
            index={2}
            done={hasWorkflow}
            disabled={!canCreateWorkflow}
            title={t('Create a workflow')}
            description={
              canCreateWorkflow
                ? t('Choose a trigger, then add the steps to run')
                : t('Finish step one first by creating a project')
            }
            onClick={onNewWorkflow}
          />
        </MessageTooltip>
      </div>
    </section>
  );
}

const OnboardingStep = React.forwardRef<
  HTMLButtonElement,
  {
    index: number;
    done: boolean;
    title: string;
    description: string;
    disabled?: boolean;
    onClick?: () => void;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ index, done, title, description, disabled, onClick, ...rest }, ref) => (
  <button
    ref={ref}
    type="button"
    disabled={disabled}
    onClick={onClick}
    className="flex w-full items-center gap-3 rounded-lg border bg-background p-3 text-left hover:border-primary disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border"
    {...rest}
  >
    <span
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground',
        done && 'bg-success',
      )}
    >
      {done ? <Check className="size-3.5" strokeWidth={3} /> : index}
    </span>
    <span className="flex min-w-0 flex-1 flex-col">
      <span
        className={cn(
          'text-sm font-medium',
          done && 'text-muted-foreground line-through',
        )}
      >
        {title}
      </span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </span>
    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
  </button>
));
OnboardingStep.displayName = 'OnboardingStep';

function storageKey(): string {
  return `${DISMISS_KEY_PREFIX}${
    authenticationSession.getCurrentUserId() ?? ''
  }`;
}

function readDismissed(): boolean {
  try {
    return BrowserStorage.getInstance().getItem(storageKey()) === 'true';
  } catch {
    return false;
  }
}

function markDismissed(): boolean {
  try {
    BrowserStorage.getInstance().setItem(storageKey(), 'true');
  } catch {
    return true;
  }
  return true;
}

const DISMISS_KEY_PREFIX = 'home-onboarding-dismissed:';
