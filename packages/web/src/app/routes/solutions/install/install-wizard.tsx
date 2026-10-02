import {
  SolutionDetail,
  SolutionInstallResult,
  solutionUtils,
} from '@fema-ipaas/shared';
import { useState } from 'react';

import { WizardStep } from '@/features/solutions';
import { authenticationSession } from '@/lib/authentication-session';

import { ChecksStep } from './checks-step';
import { ConfigStep } from './config-step';
import { ConfirmStep } from './confirm-step';
import { ConnectionsStep } from './connections-step';
import { DoneStep } from './done-step';
import { ProjectStep } from './project-step';
import { WizardStepper } from './wizard-parts';
import { WizardDraft } from './wizard-types';

function InstallWizard({ solution }: InstallWizardProps) {
  const pkg = solution.package;
  const [step, setStep] = useState<WizardStep>('project');
  const [draft, setDraft] = useState<WizardDraft>(() => initialDraft(solution));
  const [result, setResult] = useState<SolutionInstallResult | null>(null);

  if (result) {
    return <DoneStep result={result} />;
  }

  const goTo = (next: WizardStep) => setStep(next);
  const update = (patch: Partial<WizardDraft>) =>
    setDraft({ ...draft, ...patch });

  return (
    <div className="flex flex-col gap-6">
      <WizardStepper current={step} />
      {step === 'project' && (
        <ProjectStep
          pkg={pkg}
          projectId={draft.projectId}
          onNext={(projectId) => {
            setDraft(
              projectId === draft.projectId
                ? draft
                : { ...draft, projectId, connections: {}, acknowledged: [] },
            );
            goTo('connections');
          }}
        />
      )}
      {step === 'connections' && (
        <ConnectionsStep
          pkg={pkg}
          projectId={draft.projectId}
          connections={draft.connections}
          onBack={() => goTo('project')}
          onNext={(connections) => {
            update({ connections, acknowledged: [] });
            goTo('config');
          }}
        />
      )}
      {step === 'config' && (
        <ConfigStep
          pkg={pkg}
          config={draft.config}
          onBack={() => goTo('connections')}
          onNext={(config) => {
            update({ config });
            goTo('checks');
          }}
        />
      )}
      {step === 'checks' && (
        <ChecksStep
          solutionId={solution.id}
          projectId={draft.projectId}
          connections={draft.connections}
          acknowledged={draft.acknowledged}
          onBack={() => goTo('config')}
          onNext={(acknowledged) => {
            update({ acknowledged });
            goTo('confirm');
          }}
        />
      )}
      {step === 'confirm' && (
        <ConfirmStep
          solution={solution}
          draft={draft}
          onBack={() => goTo('checks')}
          onInstalled={setResult}
        />
      )}
    </div>
  );
}

function initialDraft(solution: SolutionDetail): WizardDraft {
  return {
    projectId: authenticationSession.getProjectId() ?? '',
    connections: {},
    config: solutionUtils.resolveConfig({
      items: solution.package.config,
      provided: {},
    }).values,
    acknowledged: [],
  };
}

export { InstallWizard };

type InstallWizardProps = {
  solution: SolutionDetail;
};
