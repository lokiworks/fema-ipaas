import { t } from 'i18next';

import { connectorsHooks } from '@/features/connectors';

import { solutionsUtils } from '../utils/solutions-utils';

function SolutionCheckLabel({ label }: SolutionCheckLabelProps) {
  const connectorName = solutionsUtils.generatedConnectionCheckConnector(label);
  if (connectorName === null) {
    return <>{label}</>;
  }
  return <ConnectionCheckLabel connectorName={connectorName} />;
}

function ConnectionCheckLabel({ connectorName }: { connectorName: string }) {
  const { summary } = connectorsHooks.useConnectorSummary({
    name: connectorName,
  });
  return (
    <>
      {t('Connection for {connector} works', {
        connector: summary?.displayName ?? connectorName,
      })}
    </>
  );
}

export { SolutionCheckLabel };

type SolutionCheckLabelProps = {
  label: string;
};
