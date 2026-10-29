import { t } from 'i18next';
import { useState } from 'react';

import { cn } from '@/lib/utils';

interface ReadMoreProps {
  text: string;
  amountOfCharacters?: number;
}

export const ReadMoreDescription = ({
  text,
  amountOfCharacters = 70,
}: ReadMoreProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const itCanOverflow = text.length > amountOfCharacters;
  const beginText = itCanOverflow ? text.slice(0, amountOfCharacters) : text;
  const endText = text.slice(amountOfCharacters);

  const handleKeyboard = (e: { code: string }) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <p className="text-muted-foreground text-xs whitespace-pre-wrap">
      {beginText}
      {itCanOverflow && (
        <>
          {!isExpanded && <span>... </span>}
          <span
            className={cn('whitespace-pre-wrap', !isExpanded && 'hidden')}
            aria-hidden={!isExpanded}
          >
            {endText}
          </span>
          <span
            className="text-primary ml-2 cursor-pointer"
            role="button"
            tabIndex={0}
            aria-expanded={isExpanded}
            onKeyDown={handleKeyboard}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? t('Show less') : t('Show more')}
          </span>
        </>
      )}
    </p>
  );
};
