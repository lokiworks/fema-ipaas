import { Eye, EyeOff } from 'lucide-react';
import * as React from 'react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input, InputProps } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type SecretInputProps = Omit<InputProps, 'value' | 'onChange'> & {
  value?: string;
  onChange?: (value: string) => void;
};

export const SecretInput = React.forwardRef<HTMLInputElement, SecretInputProps>(
  function SecretInput(props, ref) {
    const { value, onChange, className, ...rest } = props;
    const [revealed, setRevealed] = useState(false);
    return (
      <div className="flex items-center gap-2">
        <Input
          {...rest}
          ref={ref}
          type={revealed ? 'text' : 'password'}
          className={cn('grow', className)}
          value={value ?? ''}
          onChange={(event) => onChange?.(event.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={() => setRevealed((current) => !current)}
        >
          {revealed ? (
            <EyeOff className="size-4" />
          ) : (
            <Eye className="size-4" />
          )}
        </Button>
      </div>
    );
  },
);
