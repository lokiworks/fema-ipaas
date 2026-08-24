import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { LoadingScreen } from '@/components/custom/loading-screen';

// The OAuth2 provider sends the user here after they authorise a connection. The
// connection dialog opened this window, so the only job is to hand the code back
// to whoever opened it.
const RedirectPage: React.FC = React.memo(() => {
  const location = useLocation();
  const navigate = useNavigate();
  const hasCheckedParams = useRef(false);

  useEffect(() => {
    if (hasCheckedParams.current) {
      return;
    }
    hasCheckedParams.current = true;
    const code = new URLSearchParams(location.search).get('code');

    if (window.opener && code) {
      window.opener.postMessage({ code }, '*');
      return;
    }
    if (!window.opener && !code) {
      navigate('/');
    }
  }, [location.search, navigate]);

  return <LoadingScreen />;
});

RedirectPage.displayName = 'RedirectPage';

export { RedirectPage };
