import { useEffect, useState } from 'react';

function hasOwnHeading(root: ParentNode): boolean {
  return root.querySelector('h1:not([data-page-title])') !== null;
}

function usePageHasOwnHeading(): boolean {
  const [hasHeading, setHasHeading] = useState(false);
  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      setHasHeading(hasOwnHeading(document));
    };
    const schedule = () => {
      if (frame === 0) {
        frame = window.requestAnimationFrame(check);
      }
    };
    check();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    const stopObserving = window.setTimeout(
      () => observer.disconnect(),
      OBSERVE_MILLISECONDS,
    );
    return () => {
      observer.disconnect();
      window.clearTimeout(stopObserving);
      window.cancelAnimationFrame(frame);
    };
  }, []);
  return hasHeading;
}

export const pageHeading = { hasOwnHeading, usePageHasOwnHeading };

const OBSERVE_MILLISECONDS = 8000;
