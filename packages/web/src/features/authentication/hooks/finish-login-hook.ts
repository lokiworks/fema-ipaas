import { isNil } from '@fema-ipaas/core-utils';
import { AuthenticationResponse } from '@fema-ipaas/shared';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { authenticationSession } from '@/lib/authentication-session';
import { useRedirectAfterLogin } from '@/lib/navigation-utils';

function useFinishLogin() {
  const navigate = useNavigate();
  const redirectAfterLogin = useRedirectAfterLogin();
  return useCallback(
    (data: AuthenticationResponse) => {
      authenticationSession.saveResponse(data, false);
      if (isNil(data.projectId)) {
        navigate('/create-tenant');
        return;
      }
      redirectAfterLogin();
    },
    [navigate, redirectAfterLogin],
  );
}

export const finishLoginHooks = { useFinishLogin };
