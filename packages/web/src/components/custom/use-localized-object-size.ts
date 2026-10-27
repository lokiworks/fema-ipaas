import { isNil } from '@fema-ipaas/core-utils';
import { t } from 'i18next';
import React, { useEffect } from 'react';

const OBJECT_SIZE_PATTERN = /^(\d+)(?: items?| 项)?$/;

const useLocalizedObjectSize = (
  containerRef: React.RefObject<HTMLDivElement | null>,
) => {
  useEffect(() => {
    const container = containerRef.current;
    if (isNil(container)) {
      return;
    }
    const localize = () => {
      container.querySelectorAll('.object-size').forEach((element) => {
        const textNodes = Array.from(element.childNodes).filter(
          (node) => node.nodeType === Node.TEXT_NODE,
        );
        const match = OBJECT_SIZE_PATTERN.exec(element.textContent ?? '');
        if (textNodes.length === 0 || isNil(match)) {
          return;
        }
        const localized = t('{count, plural, =1 {1 item} other {# items}}', {
          count: Number(match[1]),
        });
        if (element.textContent === localized) {
          return;
        }
        textNodes.forEach((node, index) => {
          node.nodeValue = index === 0 ? localized : '';
        });
      });
    };
    localize();
    const observer = new MutationObserver(localize);
    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, [containerRef]);
};

export { useLocalizedObjectSize };
