import { t } from 'i18next';

function runState({
  running,
  hasProduction,
}: {
  running: boolean;
  hasProduction: boolean;
}): string {
  if (running) {
    return t('Running');
  }
  return hasProduction ? t('Stopped') : t('Not run');
}

function deployment({
  releasesEnabled,
  testLabel,
  productionLabel,
}: {
  releasesEnabled: boolean;
  testLabel: string | null;
  productionLabel: string | null;
}): string | null {
  if (releasesEnabled) {
    return t('Test {test} · Production {production}', {
      test: testLabel ?? t('not published'),
      production: productionLabel ?? t('not published'),
    });
  }
  return productionLabel
    ? t('Live version {version}', { version: productionLabel })
    : null;
}

export const workflowStatusLabels = {
  runState,
  deployment,
};
