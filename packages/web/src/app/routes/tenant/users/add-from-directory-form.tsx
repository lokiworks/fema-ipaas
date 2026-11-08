import {
  AddDirectoryMembersResponse,
  DirectoryMemberState,
  DirectorySkipReason,
  formErrors,
  TENANT_ACCESS_LIMITS,
  TenantDirectoryMember,
  TenantModule,
  TenantRole,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useDebounce } from 'use-debounce';
import { z } from 'zod';

import { SearchInput } from '@/components/custom/search-input';
import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { tenantAccessHooks, tenantAccessUtils } from '@/features/tenant-access';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

import { ModuleCheckboxes } from './module-checkboxes';

export function AddFromDirectoryForm({
  onOpenChange,
  onFinished,
}: {
  onOpenChange: (open: boolean) => void;
  onFinished: () => void;
}) {
  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword] = useDebounce(keyword.trim(), 300);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AddDirectoryMembersResponse | null>(
    null,
  );
  const directory = tenantAccessHooks.useDirectory({
    keyword: debouncedKeyword,
    page,
    enabled: result === null,
  });
  const { mutate: addMembers, isPending } =
    tenantAccessHooks.useAddFromDirectory();
  const form = useForm<DirectoryFormValues>({
    resolver: zodResolver(DirectoryFormSchema),
    mode: 'onChange',
    defaultValues: directoryFormDefaults(),
  });
  const subjects = form.watch('subjects');

  if (result) {
    return (
      <DirectoryResult result={result} onDone={() => onOpenChange(false)} />
    );
  }

  const toggle = ({
    subject,
    checked,
  }: {
    subject: string;
    checked: boolean;
  }): void => {
    form.setValue(
      'subjects',
      checked
        ? [...subjects, subject]
        : subjects.filter((value) => value !== subject),
      { shouldValidate: true },
    );
  };

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) =>
          addMembers(values, {
            onSuccess: (response) => {
              setResult(response);
              onFinished();
            },
          }),
        )}
      >
        <p className="text-sm text-muted-foreground">
          {t(
            'Choose people from the member directory of your company account. Each of them gets an account the first time they sign in with the company account, with the role and permissions chosen here. Nobody is notified.',
          )}
        </p>
        <SearchInput
          value={keyword}
          onChange={(value) => {
            setKeyword(value);
            setPage(1);
          }}
          placeholder={t('Search the directory by name or username')}
          data-testid="directory-search"
        />
        <FormField
          control={form.control}
          name="subjects"
          render={() => (
            <FormItem>
              <DirectoryList
                isLoading={directory.isLoading}
                error={directory.error}
                items={directory.data?.items ?? []}
                selected={subjects}
                onToggle={toggle}
              />
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span data-testid="directory-selected-count">
                  {t('{count} selected', { count: subjects.length })}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={page <= 1 || directory.isFetching}
                    onClick={() => setPage(page - 1)}
                  >
                    {t('Previous page')}
                  </Button>
                  <span>{t('Page {page}', { page })}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!directory.data?.hasNext || directory.isFetching}
                    onClick={() => setPage(page + 1)}
                  >
                    {t('Next page')}
                  </Button>
                </div>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="tenantRole"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Platform role')}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger data-testid="directory-role">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {DIRECTORY_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {tenantAccessUtils.roleLabel({
                        tenantRole: role,
                        isOwner: false,
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="modules"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Module permissions')}</FormLabel>
              <ModuleCheckboxes
                value={field.value}
                onChange={field.onChange}
                isAdmin={form.watch('tenantRole') === TenantRole.ADMIN}
              />
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button
            type="submit"
            loading={isPending}
            disabled={subjects.length === 0}
            data-testid="directory-submit"
          >
            {t('addMembersCount', { count: subjects.length })}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function DirectoryList({
  isLoading,
  error,
  items,
  selected,
  onToggle,
}: {
  isLoading: boolean;
  error: Error | null;
  items: TenantDirectoryMember[];
  selected: string[];
  onToggle: (params: { subject: string; checked: boolean }) => void;
}) {
  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (error) {
    return (
      <div
        role="alert"
        className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        data-testid="directory-error"
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        <span>
          {api.extractServerErrorMessage(error, t('Something went wrong'))}
        </span>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <p className="rounded-md border px-3 py-6 text-sm text-muted-foreground">
        {t('Nobody in the directory matches this search')}
      </p>
    );
  }
  return (
    <ScrollArea className="h-64 rounded-md border">
      <ul className="flex flex-col" data-testid="directory-list">
        {items.map((item) => {
          const selectable = item.state === DirectoryMemberState.AVAILABLE;
          return (
            <li
              key={item.subject}
              className={cn(
                'flex items-center gap-3 border-b px-3 py-2 last:border-b-0',
                !selectable && 'text-muted-foreground',
              )}
              data-testid={`directory-member-${item.subject}`}
            >
              <Checkbox
                aria-label={t('Select {name}', { name: item.name })}
                checked={selected.includes(item.subject)}
                disabled={!selectable}
                onCheckedChange={(checked) =>
                  onToggle({ subject: item.subject, checked: checked === true })
                }
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <TextWithTooltip tooltipMessage={item.name}>
                  <p className="truncate text-sm font-medium">{item.name}</p>
                </TextWithTooltip>
                {item.username && (
                  <span className="truncate text-xs text-muted-foreground">
                    {item.username}
                  </span>
                )}
              </div>
              <DirectoryStateBadge member={item} />
            </li>
          );
        })}
      </ul>
    </ScrollArea>
  );
}

function DirectoryStateBadge({ member }: { member: TenantDirectoryMember }) {
  switch (member.state) {
    case DirectoryMemberState.AVAILABLE:
      return null;
    case DirectoryMemberState.ADDED:
      return <Badge variant="info">{t('Added, not signed in yet')}</Badge>;
    case DirectoryMemberState.MEMBER:
      return <Badge variant="success">{t('Already a member')}</Badge>;
    case DirectoryMemberState.DISABLED:
      return <Badge variant="outline">{t('Disabled')}</Badge>;
    case DirectoryMemberState.UNAVAILABLE:
      return (
        <Badge variant="outline">
          {t('Suspended or removed in the directory')}
        </Badge>
      );
  }
}

function DirectoryResult({
  result,
  onDone,
}: {
  result: AddDirectoryMembersResponse;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col gap-4" data-testid="directory-result">
      <DialogHeader>
        <DialogTitle>
          {t('directoryMembersAddedCount', { count: result.added.length })}
        </DialogTitle>
        <DialogDescription>
          {t(
            'They can sign in with the company account now. Their account is created at the first sign-in.',
          )}
        </DialogDescription>
      </DialogHeader>
      {result.added.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {result.added.map((member) => (
            <Badge key={member.subject} variant="outline">
              {member.name}
            </Badge>
          ))}
        </div>
      )}
      {result.skipped.length > 0 && (
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t('Not added')}</span>
          {result.skipped.map((member) => (
            <span key={member.subject} className="text-muted-foreground">
              {member.name ?? member.subject} · {skipReasonLabel(member.reason)}
            </span>
          ))}
        </div>
      )}
      <DialogFooter>
        <Button onClick={onDone}>{t('Done')}</Button>
      </DialogFooter>
    </div>
  );
}

function skipReasonLabel(reason: DirectorySkipReason): string {
  switch (reason) {
    case DirectorySkipReason.ALREADY_MEMBER:
      return t('Already a member');
    case DirectorySkipReason.NOT_IN_DIRECTORY:
      return t('Not found in the directory');
    case DirectorySkipReason.NOT_IN_GOOD_STANDING:
      return t('Suspended or removed in the directory');
  }
}

function directoryFormDefaults(): DirectoryFormValues {
  return {
    subjects: [],
    tenantRole: TenantRole.MEMBER,
    modules: [],
  };
}

const DIRECTORY_ROLES = [
  TenantRole.MEMBER,
  TenantRole.OPERATOR,
  TenantRole.ADMIN,
];

const DirectoryFormSchema = z.object({
  subjects: z
    .array(z.string())
    .min(1, formErrors.required)
    .max(
      TENANT_ACCESS_LIMITS.maxDirectoryMembersPerBatch,
      'atMostFiftyMembers',
    ),
  tenantRole: z.enum([
    TenantRole.ADMIN,
    TenantRole.MEMBER,
    TenantRole.OPERATOR,
  ]),
  modules: z.array(z.enum(TenantModule)),
});

type DirectoryFormValues = z.infer<typeof DirectoryFormSchema>;
