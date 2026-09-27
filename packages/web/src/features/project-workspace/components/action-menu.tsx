import { LucideIcon, MoreHorizontal } from 'lucide-react';
import React from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export function ActionMenu({
  items,
  label,
  trigger,
  align = 'end',
  triggerClassName,
}: {
  items: ActionMenuEntry[];
  label: string;
  trigger?: React.ReactNode;
  align?: 'start' | 'end';
  triggerClassName?: string;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={label}
            className={triggerClassName}
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="w-56"
        onClick={(event) => event.stopPropagation()}
      >
        {items.map((item, index) =>
          item === 'divider' ? (
            <DropdownMenuSeparator key={`divider-${index}`} />
          ) : (
            <DropdownMenuItem
              key={item.key}
              disabled={Boolean(item.disabledReason)}
              variant={item.destructive ? 'destructive' : 'default'}
              onSelect={() => item.onSelect()}
              className="items-start"
            >
              <item.icon className="mt-0.5" />
              <span className="flex min-w-0 flex-col">
                <span>{item.label}</span>
                {(item.disabledReason || item.description) && (
                  <span
                    className={cn(
                      'text-xs text-muted-foreground',
                      item.disabledReason && 'whitespace-normal',
                    )}
                  >
                    {item.disabledReason ?? item.description}
                  </span>
                )}
              </span>
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type ActionMenuItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  disabledReason?: string | null;
  description?: string;
  destructive?: boolean;
};

export type ActionMenuEntry = ActionMenuItem | 'divider';
