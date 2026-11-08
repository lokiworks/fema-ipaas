import {
  CreatePlatformClientRequestBody,
  PlatformClientKind,
  PlatformScope,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { TriangleAlert } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { CopyToClipboardInput } from '@/components/custom/clipboard/copy-to-clipboard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { internalErrorMessage } from '@/components/ui/sonner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  operatorHooks,
  operatorSchemas,
  operatorUtils,
  PlatformClientFormValues,
} from '@/features/operator';
import { FormServerError } from '@/features/tenant-access';
import { api } from '@/lib/api';

export function CreatePlatformClientDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <CreateForm
          key={open ? 'open' : 'closed'}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function CreateForm({ onClose }: { onClose: () => void }) {
  const form = useForm<PlatformClientFormValues>({
    mode: 'onChange',
    resolver: zodResolver(operatorSchemas.platformClientForm),
    defaultValues: platformClientDefaults(),
  });
  const kind = form.watch('kind');
  const {
    mutate: create,
    isPending,
    data: created,
  } = operatorHooks.useCreatePlatformClient({
    onError: (error) =>
      form.setError('root.serverError', {
        type: 'manual',
        message: api.extractServerErrorMessage(error, internalErrorMessage()),
      }),
  });

  if (created) {
    return (
      <div className="flex flex-col gap-4" data-testid="client-created">
        <DialogHeader>
          <DialogTitle>{t('Client created')}</DialogTitle>
          <DialogDescription>{created.client.name}</DialogDescription>
        </DialogHeader>
        {created.secret ? (
          <>
            <Alert variant="warning">
              <TriangleAlert className="h-4 w-4" />
              <AlertDescription>
                {t(
                  'Copy the key now. It is shown only once and cannot be recovered.',
                )}
              </AlertDescription>
            </Alert>
            <CopyToClipboardInput textToCopy={created.secret} useInput={true} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t(
              'Tokens signed by this issuer are accepted from now on. No key was issued.',
            )}
          </p>
        )}
        <DialogFooter>
          <Button onClick={onClose}>{t('Done')}</Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) => {
          form.clearErrors('root.serverError');
          const parsed = CreatePlatformClientRequestBody.safeParse(
            operatorUtils.platformClientRequest(values),
          );
          if (parsed.success) {
            create(parsed.data);
          }
        })}
      >
        <DialogHeader>
          <DialogTitle>{t('New platform client')}</DialogTitle>
          <DialogDescription>
            {t('Choose how the other system proves who it is.')}
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={kind}
          onValueChange={(value) =>
            form.setValue(
              'kind',
              value === PlatformClientKind.TRUSTED_ISSUER
                ? PlatformClientKind.TRUSTED_ISSUER
                : PlatformClientKind.API_KEY,
            )
          }
        >
          <TabsList>
            <TabsTrigger value={PlatformClientKind.API_KEY}>
              {t('API key')}
            </TabsTrigger>
            <TabsTrigger value={PlatformClientKind.TRUSTED_ISSUER}>
              {t('Trusted issuer')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel showRequiredIndicator>{t('Name')}</FormLabel>
              <FormControl>
                <Input {...field} data-testid="client-name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {kind === PlatformClientKind.TRUSTED_ISSUER && (
          <>
            <FormField
              control={form.control}
              name="issuer"
              render={({ field }) => (
                <FormItem>
                  <FormLabel showRequiredIndicator>{t('Issuer URL')}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="https://iam.example.com"
                      data-testid="client-issuer"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="subjects"
              render={({ field }) => (
                <FormItem>
                  <FormLabel showRequiredIndicator>
                    {t('Allowed subjects')}
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      minRows={2}
                      data-testid="client-subjects"
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Client IDs or subjects allowed to call, one per line. Matched against sub, client_id and azp.',
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}
        <FormField
          control={form.control}
          name="scopes"
          render={({ field }) => (
            <FormItem className="flex flex-col gap-2">
              <FormLabel>{t('Permissions')}</FormLabel>
              {Object.values(PlatformScope).map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={field.value.includes(scope)}
                    data-testid={`scope-${scope}`}
                    onCheckedChange={(checked) =>
                      field.onChange(
                        checked === true
                          ? [...field.value, scope]
                          : field.value.filter((value) => value !== scope),
                      )
                    }
                  />
                  {operatorUtils.scopeLabel(scope)}
                </label>
              ))}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormServerError
          message={form.formState.errors.root?.serverError?.message}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={isPending} data-testid="client-submit">
            {t('Create')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function platformClientDefaults(): PlatformClientFormValues {
  return {
    kind: PlatformClientKind.API_KEY,
    name: '',
    issuer: '',
    subjects: '',
    scopes: [PlatformScope.TENANT_PROVISION],
  };
}
