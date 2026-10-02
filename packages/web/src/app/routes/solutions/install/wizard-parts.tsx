import { t } from 'i18next';
import { Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { WIZARD_STEPS, WizardStep } from '@/features/solutions';
import { cn } from '@/lib/utils';

function WizardStepper({ current }: WizardStepperProps) {
  const currentIndex = WIZARD_STEPS.indexOf(current);
  return (
    <ol className="flex flex-wrap items-center gap-x-6 gap-y-2">
      {WIZARD_STEPS.map((step, index) => (
        <li
          key={step}
          className={cn(
            'flex items-center gap-2 text-sm',
            index === currentIndex
              ? 'font-medium text-foreground'
              : 'text-muted-foreground',
          )}
        >
          <span
            className={cn(
              'flex size-6 items-center justify-center rounded-full border text-xs',
              index === currentIndex &&
                'border-primary bg-primary text-primary-foreground',
              index < currentIndex && 'border-primary text-primary',
            )}
          >
            {index < currentIndex ? <Check className="size-3" /> : index + 1}
          </span>
          {stepLabel(step)}
        </li>
      ))}
    </ol>
  );
}

function WizardFooter({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  nextLoading,
  nextType = 'button',
  hint,
}: WizardFooterProps) {
  return (
    <div className="flex items-center gap-3 border-t pt-4">
      {onBack && (
        <Button type="button" variant="outline" onClick={onBack}>
          {t('Previous step')}
        </Button>
      )}
      <div className="grow" />
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      <Button
        type={nextType}
        disabled={nextDisabled}
        loading={nextLoading}
        onClick={onNext}
      >
        {nextLabel ?? t('Next step')}
      </Button>
    </div>
  );
}

function stepLabel(step: WizardStep): string {
  switch (step) {
    case 'project':
      return t('Project');
    case 'connections':
      return t('Connections');
    case 'config':
      return t('Configuration');
    case 'checks':
      return t('Checks');
    case 'confirm':
      return t('Confirm');
  }
}

export { WizardFooter, WizardStepper };

type WizardStepperProps = {
  current: WizardStep;
};

type WizardFooterProps = {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
  nextType?: 'button' | 'submit';
  hint?: string;
};
