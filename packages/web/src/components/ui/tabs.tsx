import { cva, type VariantProps } from 'class-variance-authority';
import { Tabs as TabsPrimitive } from 'radix-ui';
import * as React from 'react';

import { cn } from '@/lib/utils';

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root data-slot="tabs" className={cn(className)} {...props} />
  );
}

const tabsListVariants = cva('inline-flex', {
  variants: {
    variant: {
      default:
        'items-center gap-6 h-10 border-b border-border text-muted-foreground',
      segmented:
        'items-center justify-center h-8 rounded-md bg-muted p-0.5 text-muted-foreground',
      outline: '',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

const tabsTriggerVariants = cva(
  'inline-flex items-center justify-center gap-1.5',
  {
    variants: {
      variant: {
        default:
          'relative h-full whitespace-nowrap text-sm transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:text-primary disabled:pointer-events-none disabled:opacity-50 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full data-[state=active]:font-medium data-[state=active]:text-primary data-[state=active]:after:bg-primary',
        segmented:
          'whitespace-nowrap rounded-sm px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs',
        outline:
          'px-3 py-1 text-sm font-medium ring-offset-background transition-all border-b-2 border-transparent data-[state=active]:border-secondary data-[state=active]:text-foreground text-accent-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function TabsList({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(tabsListVariants({ variant, className }))}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> &
  VariantProps<typeof tabsTriggerVariants>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      aria-controls={undefined}
      className={cn(tabsTriggerVariants({ variant, className }))}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        'mt-5 ring-offset-background focus-visible:outline-hidden',
        className,
      )}
      {...props}
    />
  );
}

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  tabsListVariants,
  tabsTriggerVariants,
};
