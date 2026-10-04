import { t } from 'i18next';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

import {
  setupWizardUtils,
  WIZARD_STEPS,
  WizardStep,
} from '../utils/setup-wizard-utils';

export function WizardStepper({
  current,
  onSelect,
}: {
  current: WizardStep;
  onSelect: (step: WizardStep) => void;
}) {
  const currentIndex = WIZARD_STEPS.indexOf(current);
  return (
    <nav aria-label={t('Setup progress')} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 md:hidden">
        <span className="text-sm font-medium">
          {stepTitle({ step: current })}
        </span>
        <span className="text-xs text-muted-foreground">
          {t('Step {current} of {total}', {
            current: setupWizardUtils.stepNumber({ step: current }),
            total: WIZARD_STEPS.length,
          })}
        </span>
      </div>
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-muted md:hidden"
        role="presentation"
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{
            width: `${((currentIndex + 1) / WIZARD_STEPS.length) * 100}%`,
          }}
        />
      </div>
      <ol className="hidden items-center md:flex">
        {WIZARD_STEPS.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          return (
            <li
              key={step}
              className={cn('flex items-center', index > 0 && 'flex-1')}
            >
              {index > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    'mx-3 h-px flex-1',
                    index <= currentIndex ? 'bg-primary' : 'bg-border',
                  )}
                />
              )}
              <button
                type="button"
                disabled={!done}
                aria-current={active ? 'step' : undefined}
                onClick={() => onSelect(step)}
                className={cn(
                  'flex items-center gap-2 text-sm',
                  active
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground',
                  done && 'cursor-pointer hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs',
                    active &&
                      'border-primary bg-primary text-primary-foreground',
                    done && 'border-primary text-primary',
                  )}
                >
                  {done ? <Check className="size-3.5" /> : index + 1}
                </span>
                <span className="whitespace-nowrap">{stepTitle({ step })}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function stepTitle({ step }: { step: WizardStep }): string {
  switch (step) {
    case WizardStep.ENVIRONMENT:
      return t('Environment');
    case WizardStep.ADMINISTRATOR:
      return t('Administrator');
    case WizardStep.ORGANIZATION:
      return t('Organization');
    case WizardStep.SERVICES:
      return t('Optional services');
    case WizardStep.REVIEW:
      return t('Confirm');
  }
}
