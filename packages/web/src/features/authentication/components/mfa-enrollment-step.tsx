import { t } from 'i18next';

import { finishLoginHooks } from '../hooks/finish-login-hook';

import { BackLink, Heading } from './auth-landing/auth-drawer-parts';
import { MfaEnrollmentFlow } from './mfa-enrollment-flow';

function MfaEnrollmentStep({
  challengeToken,
  onBack,
  onSessionLost,
}: MfaEnrollmentStepProps) {
  const finishLogin = finishLoginHooks.useFinishLogin();
  return (
    <>
      <BackLink onClick={onBack} />
      <Heading
        title={t('Set up two-step verification')}
        subtitle={t(
          'Your organization requires two-step verification before you can sign in.',
        )}
      />
      <MfaEnrollmentFlow
        challengeToken={challengeToken}
        onCompleted={({ authentication }) => {
          if (authentication === null) {
            onSessionLost();
            return;
          }
          finishLogin(authentication);
        }}
      />
    </>
  );
}

export { MfaEnrollmentStep };

type MfaEnrollmentStepProps = {
  challengeToken: string;
  onBack: () => void;
  onSessionLost: () => void;
};
