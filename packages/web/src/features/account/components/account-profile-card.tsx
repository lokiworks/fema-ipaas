import {
  UpdateProfileRequestBody,
  UserWithMetaInformation,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { UserAvatar } from '@/components/custom/user-avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

import { accountHooks } from '../hooks/account-hooks';
import { accountUtils } from '../utils/account-utils';

export function AccountProfileCard({
  user,
  details,
}: {
  user: UserWithMetaInformation;
  details: { label: string; value: string }[];
}) {
  const name = accountUtils.displayName(user);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Profile')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <UserAvatar
            name={name}
            email={user.email}
            imageUrl={user.imageUrl}
            size={48}
            disableTooltip
          />
          <div className="flex min-w-0 flex-col">
            <span className="font-semibold">{name || user.email}</span>
            <TextWithTooltip tooltipMessage={user.email}>
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            </TextWithTooltip>
          </div>
        </div>
        <ProfileNameForm key={name} initialName={name} />
        <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          {details.map((detail) => (
            <div key={detail.label} className="contents">
              <dt className="text-muted-foreground">{detail.label}</dt>
              <dd className="min-w-0 break-words">{detail.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function ProfileNameForm({ initialName }: { initialName: string }) {
  const form = useForm<UpdateProfileRequestBody>({
    resolver: zodResolver(UpdateProfileRequestBody),
    defaultValues: { name: initialName },
    mode: 'onChange',
  });
  const updateProfile = accountHooks.useUpdateProfile();
  const dirty = form.watch('name').trim() !== initialName;

  const handleSubmit = (values: UpdateProfileRequestBody) => {
    form.clearErrors('root.serverError');
    updateProfile.mutate(values.name.trim(), {
      onSuccess: () => toast.success(t('Saved')),
      onError: () =>
        form.setError('root.serverError', {
          type: 'manual',
          message: t('Something went wrong, please try again later'),
        }),
    });
  };

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-2"
        onSubmit={form.handleSubmit(handleSubmit)}
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Name')}</FormLabel>
              <div className="flex items-center gap-2">
                <FormControl>
                  <Input {...field} maxLength={20} className="max-w-sm" />
                </FormControl>
                {dirty && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => form.setValue('name', initialName)}
                    >
                      {t('Cancel')}
                    </Button>
                    <Button type="submit" loading={updateProfile.isPending}>
                      {t('Save')}
                    </Button>
                  </>
                )}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        {form.formState.errors.root?.serverError && (
          <FormMessage>
            {form.formState.errors.root.serverError.message}
          </FormMessage>
        )}
      </form>
    </Form>
  );
}
