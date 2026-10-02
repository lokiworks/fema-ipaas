'use client';

import { t } from 'i18next';
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { Toaster as Sonner, toast, type ToasterProps } from 'sonner';

import { useTheme } from '@/components/providers/theme-provider';

export function internalErrorMessage() {
  return t('An unexpected error occurred. Please try again in a moment.');
}

export function internalErrorToast() {
  const description = internalErrorMessage();
  console.error('internalErrorToast', description);
  toast.error(t('Something went wrong'), {
    description,
    duration: 3000,
  });
}

export function unsavedChangesToast() {
  toast.error(t('Unsaved Changes'), {
    description: t(
      'Something went wrong and there are unsaved changes, please refresh and contact support if the problem persists.',
    ),
    duration: Infinity,
    id: 'unsaved-changes',
  });
}

function Toaster({ ...props }: ToasterProps) {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      expand={true}
      toastOptions={{
        classNames: {
          toast: `
            data-[type=error]:text-destructive-700!
            data-[type=warning]:text-warning-700!
            data-[type=success]:text-success-700!
          `,
          description: `
            data-[type=error]:text-destructive-700!
            data-[type=warning]:text-warning-700!
            data-[type=success]:text-success-700!
          `,
        },
        descriptionClassName: 'text-inherit!',
      }}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-text': 'var(--foreground)',
          '--normal-bg': 'var(--background)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
