import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { CopyTextTooltip } from '@/components/custom/clipboard/copy-text-tooltip';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormDescription,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { networkAgentsHooks } from '@/features/network-agents';

const FormValues = z.object({
  displayName: z.string().min(1, 'formErrors.required'),
  hostAllowlist: z.string(),
  cidrAllowlist: z.string(),
});

type FormValues = z.infer<typeof FormValues>;

const splitList = (value: string) =>
  value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

export const CreateAgentDialog = () => {
  const [open, setOpen] = useState(false);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(FormValues),
    defaultValues: { displayName: '', hostAllowlist: '', cidrAllowlist: '' },
  });

  const { mutate, isPending } = networkAgentsHooks.useCreateNetworkAgent(
    (token) => {
      setIssuedToken(token);
      form.reset();
    },
  );

  const close = () => {
    setOpen(false);
    setIssuedToken(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4 mr-2" />
          {t('New agent')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        {issuedToken ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('Agent token')}</DialogTitle>
              <DialogDescription>
                {t(
                  'Give this token to the agent once. It is not stored and cannot be shown again.',
                )}
              </DialogDescription>
            </DialogHeader>
            <CopyTextTooltip title={t('Copy')} text={issuedToken}>
              <code className="block w-full break-all rounded bg-muted p-3 font-mono text-xs">
                {issuedToken}
              </code>
            </CopyTextTooltip>
            <DialogFooter>
              <Button onClick={close}>{t('Done')}</Button>
            </DialogFooter>
          </>
        ) : (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((values) =>
                mutate({
                  displayName: values.displayName,
                  hostAllowlist: splitList(values.hostAllowlist),
                  cidrAllowlist: splitList(values.cidrAllowlist),
                }),
              )}
            >
              <DialogHeader>
                <DialogTitle>{t('New network agent')}</DialogTitle>
                <DialogDescription>
                  {t(
                    'An agent reaches systems the platform cannot reach itself. It can only call what its allowlist permits.',
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4 py-4">
                <FormField
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <Label htmlFor="displayName">{t('Name')}</Label>
                      <Input
                        {...field}
                        id="displayName"
                        placeholder={t('Datacenter agent')}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="hostAllowlist"
                  render={({ field }) => (
                    <FormItem>
                      <Label htmlFor="hostAllowlist">
                        {t('Allowed hosts')}
                      </Label>
                      <Input
                        {...field}
                        id="hostAllowlist"
                        placeholder="erp.internal, crm.internal"
                      />
                      <FormDescription className="text-xs">
                        {t(
                          'Comma separated. An agent with an empty allowlist can reach nothing.',
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="cidrAllowlist"
                  render={({ field }) => (
                    <FormItem>
                      <Label htmlFor="cidrAllowlist">
                        {t('Allowed CIDR ranges')}
                      </Label>
                      <Input
                        {...field}
                        id="cidrAllowlist"
                        placeholder="10.0.0.0/8, 192.168.1.0/24"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="submit" loading={isPending}>
                  {t('Create')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
};
