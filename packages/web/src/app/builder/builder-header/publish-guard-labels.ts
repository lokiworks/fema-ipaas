import { t } from 'i18next';

function dialogLabels({ target }: { target: PublishTarget }): DialogLabels {
  if (target === 'test') {
    return {
      title: t('Deploy to test with warnings?'),
      description: t(
        'These warnings do not block deploying to test, but the workflow may not behave as expected.',
      ),
      confirm: t('Deploy to test anyway'),
    };
  }
  return {
    title: t('Publish with warnings?'),
    description: t(
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
