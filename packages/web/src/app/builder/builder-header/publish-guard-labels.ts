import { t } from 'i18next';

function dialogLabels({
  target,
  hasAiPending,
}: {
  target: PublishTarget;
  hasAiPending: boolean;
}): DialogLabels {
  if (target === 'test') {
    return {
      title: hasAiPending
        ? t('Deploy reminder')
        : t('Deploy to test with warnings?'),
      description: hasAiPending
        ? t(
            'Some AI-generated steps have not been confirmed. Check them before deploying to test, or deploy anyway.',
          )
        : t(
            'These warnings do not block deploying to test, but the workflow may not behave as expected.',
          ),
      confirm: t('Deploy to test anyway'),
    };
  }
  return {
    title: hasAiPending ? t('Publish reminder') : t('Publish with warnings?'),
    description: hasAiPending
      ? t(
          'Some AI-generated steps have not been confirmed. Check them before publishing, or publish anyway.',
        )
      : t(
          'These warnings do not block publishing, but the workflow may not behave as expected.',
        ),
    confirm: t('Publish anyway'),
  };
}

export const publishGuardLabels = { dialogLabels };

export type PublishTarget = 'production' | 'test';

type DialogLabels = {
  title: string;
  description: string;
  confirm: string;
};
