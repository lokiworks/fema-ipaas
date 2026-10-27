import { isNil } from '@fema-ipaas/core-utils';
import { t } from 'i18next';

import { errorExplanation } from '@/lib/error-explanation';
import { cn } from '@/lib/utils';

export function ExplainedErrorMessage({
  message,
  messageClassName,
}: {
  message: string;
  messageClassName?: string;
}) {
  const explanation = errorExplanation.explain({ message });
  if (isNil(explanation)) {
    return (
      <p className={cn('whitespace-pre-wrap break-words', messageClassName)}>
        {message}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="font-medium">{explanation.headline}</p>
      <p className="text-xs text-muted-foreground">{explanation.hint}</p>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">
          {t('Technical Details')}
        </summary>
        <p
          className={cn(
            'mt-1 whitespace-pre-wrap break-words',
            messageClassName,
          )}
        >
          {message}
        </p>
      </details>
    </div>
  );
}
