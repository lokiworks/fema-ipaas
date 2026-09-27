import {
  BLUEPRINT_LIMITS,
  BlueprintAuthType,
  blueprintFactory,
  ConnectorBlueprintDetail,
  formErrors,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { connectorBlueprintHooks } from '../../hooks/connector-blueprint-hooks';

export function NewAuthDialog({
  open,
  onOpenChange,
  detail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: ConnectorBlueprintDetail;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <NewAuthForm
          key={open ? 'open' : 'closed'}
          detail={detail}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}

function NewAuthForm({
  detail,
  onOpenChange,
}: {
  detail: ConnectorBlueprintDetail;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { mutate, isPending } =
    connectorBlueprintHooks.useUpdateConnectorBlueprint({
      id: detail.id,
      onSuccess: () => {
        onOpenChange(false);
        navigate(`/tenant/connectors/development/${detail.id}/auth/dev`);
      },
    });
  const form = useForm<NewAuthFormValues>({
    resolver: zodResolver(NewAuthFormSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      description: '',
      type: BlueprintAuthType.API_KEY,
    },
  });

  const handleSubmit = (values: NewAuthFormValues) => {
    const auth = blueprintFactory.auth({
      type: values.type,
      name: values.name.trim(),
      description: values.description.trim(),
    });
    mutate({ definition: { ...detail.definition, auth } });
  };

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(handleSubmit)}
      >
        <DialogHeader>
          <DialogTitle>{t('New authentication')}</DialogTitle>
          <DialogDescription>
            {t(
              'Define how workflow nodes prove their identity when calling this service.',
            )}
          </DialogDescription>
        </DialogHeader>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel showRequiredIndicator>
                {t('Authentication name')}
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  maxLength={BLUEPRINT_LIMITS.name}
                  placeholder={t('e.g. {name} API Key', {
                    name: detail.displayName,
                  })}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Authentication description')}</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  rows={2}
                  maxLength={BLUEPRINT_LIMITS.description}
                  placeholder={t(
                    'e.g. Generate an API Key in the service admin console under Open Platform',
                  )}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel showRequiredIndicator>
                {t('Authentication type')}
              </FormLabel>
              <FormControl>
                <div className="grid grid-cols-2 gap-2">
                  {AUTH_TYPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => field.onChange(option.value)}
                      className={cn(
                        'flex flex-col items-start gap-0.5 rounded-md border p-3 text-left hover:bg-accent',
                        field.value === option.value &&
                          'border-primary bg-accent',
                      )}
                    >
                      <span className="text-sm font-medium">
                        {option.label()}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {option.description()}
                      </span>
                    </button>
                  ))}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Alert variant="warning">
          <AlertTitle>{t('This cannot be changed later')}</AlertTitle>
          <AlertDescription>
            {t(
              'The authentication type cannot be changed after creation, and each connector can only have one authentication.',
            )}
          </AlertDescription>
        </Alert>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={isPending}>
            {t('Create and develop')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

const NewAuthFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, formErrors.required)
    .max(
      BLUEPRINT_LIMITS.name,
      'Authentication name must be 30 characters or fewer',
    ),
  description: z
    .string()
    .max(
      BLUEPRINT_LIMITS.description,
      'Authentication description must be 200 characters or fewer',
    ),
  type: z.enum(BlueprintAuthType),
});

type NewAuthFormValues = z.infer<typeof NewAuthFormSchema>;

const AUTH_TYPE_OPTIONS: {
  value: BlueprintAuthType;
  label: () => string;
  description: () => string;
}[] = [
  {
    value: BlueprintAuthType.AUTHORIZATION_CODE,
    label: () => t('Authorization code'),
    description: () =>
      t(
        'OAuth2 authorization code, the user is redirected to the service to approve',
      ),
  },
  {
    value: BlueprintAuthType.CLIENT_CREDENTIALS,
    label: () => t('Client credentials'),
    description: () =>
      t('OAuth2 client credentials, for service-to-service calls'),
  },
  {
    value: BlueprintAuthType.API_KEY,
    label: () => t('API Key'),
    description: () =>
      t('Carry a secret key in the request header or query string'),
  },
  {
    value: BlueprintAuthType.BASIC_AUTH,
    label: () => t('Basic Auth'),
    description: () => t('Username and password'),
  },
];
