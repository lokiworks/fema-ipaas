import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { issueMembersHooks } from '@/features/issues';
import { api } from '@/lib/api';

import { releasesHooks } from '../hooks/releases-hooks';
import { releaseUiUtils } from '../utils/release-ui-utils';

import { ApproverCheckboxList } from './approver-checkbox-list';

export function ApprovalSettingsCard({
  projectId,
  approverIds,
  canManage,
}: {
  projectId: string;
  approverIds: string[];
  canManage: boolean;
}) {
  const { mutate: updateEnvironments, isPending } =
    releasesHooks.useUpdateEnvironments();
  const save = ({
    values,
    onError,
  }: {
    values: string[];
    onError: (error: Error) => void;
  }) =>
    updateEnvironments(
      { projectId, enabled: true, approverIds: values },
      {
        onSuccess: () => toast.success(t('Approval settings saved')),
        onError,
      },
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Promotion approval')}</CardTitle>
        <CardDescription>
          {t(
            'Approvers review each promotion before it goes live in production. With no approvers, promotions go live right away.',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {canManage ? (
          <ApprovalSettingsForm
            key={approverIds.join(',')}
            approverIds={approverIds}
            save={save}
            isSaving={isPending}
          />
        ) : (
          <ApproversSummary approverIds={approverIds} />
        )}
      </CardContent>
    </Card>
  );
}

function ApprovalSettingsForm({
  approverIds,
  save,
  isSaving,
}: {
  approverIds: string[];
  save: (params: { values: string[]; onError: (error: Error) => void }) => void;
  isSaving: boolean;
}) {
  const form = useForm<ApprovalFormValues>({
    resolver: zodResolver(ApprovalFormSchema),
    mode: 'onChange',
    defaultValues: defaultValuesFor(approverIds),
  });
  const selected = form.watch('approverIds');

  const handleSubmit = (values: ApprovalFormValues) => {
    form.clearErrors('root.serverError');
    save({
      values: values.approverIds,
      onError: (error) =>
        form.setError('root.serverError', {
          type: 'manual',
          message: api.extractServerErrorMessage(
            error,
            t('Something went wrong'),
          ),
        }),
    });
  };

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(handleSubmit)}
      >
        <FormField
          control={form.control}
          name="approverIds"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <ApproverCheckboxList
                  value={field.value}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <p className="text-xs text-muted-foreground">
          {releaseUiUtils.approvalRequired(selected)
            ? t('Promotions wait until one of the approvers approves them.')
            : t(
                'No approvers selected: promotions go live in production without approval.',
              )}
        </p>
        {form.formState.errors.root?.serverError && (
          <p className="text-sm font-medium text-destructive">
            {form.formState.errors.root.serverError.message}
          </p>
        )}
        <Button
          type="submit"
          size="sm"
          className="self-start"
          loading={isSaving}
        >
          {t('Save')}
        </Button>
      </form>
    </Form>
  );
}

function ApproversSummary({ approverIds }: { approverIds: string[] }) {
  const { nameOf } = issueMembersHooks.useIssueMembers();
  return (
    <p className="text-sm">
      {releaseUiUtils.approvalRequired(approverIds)
        ? t('Approvers: {names}', {
            names: approverIds.map(nameOf).join('、'),
          })
        : t(
            'No approvers selected: promotions go live in production without approval.',
          )}
    </p>
  );
}

function defaultValuesFor(approverIds: string[]): ApprovalFormValues {
  return { approverIds };
}

const ApprovalFormSchema = z.object({
  approverIds: z.array(z.string()).max(20, 'You can choose up to 20 approvers'),
});

type ApprovalFormValues = z.infer<typeof ApprovalFormSchema>;
