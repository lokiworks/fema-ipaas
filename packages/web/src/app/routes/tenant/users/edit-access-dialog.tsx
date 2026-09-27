import {
  TenantMember,
  TenantModule,
  TenantRole,
  UpdateTenantMemberAccessRequestBody,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useForm } from 'react-hook-form';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { tenantAccessHooks, tenantAccessUtils } from '@/features/tenant-access';

import { ModuleCheckboxes } from './module-checkboxes';

export function EditAccessDialog({
  member,
  onOpenChange,
}: {
  member: TenantMember | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={member !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {member && (
          <EditAccessForm
            key={member.id}
            member={member}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditAccessForm({
  member,
  onOpenChange,
}: {
  member: TenantMember;
  onOpenChange: (open: boolean) => void;
}) {
  const { mutate: save, isPending } = tenantAccessHooks.useUpdateAccess();
  const form = useForm<UpdateTenantMemberAccessRequestBody>({
    resolver: zodResolver(UpdateTenantMemberAccessRequestBody),
    mode: 'onChange',
    defaultValues: accessDefaults(member),
  });
  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) =>
          save(
            { userId: member.id, request: values },
            { onSuccess: () => onOpenChange(false) },
          ),
        )}
      >
        <DialogHeader>
          <DialogTitle>
            {t('Edit {name}', {
              name: tenantAccessUtils.memberDisplayName(member),
            })}
          </DialogTitle>
          <DialogDescription>{member.email}</DialogDescription>
        </DialogHeader>
        <FormField
          control={form.control}
          name="tenantRole"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Platform role')}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {[
                    TenantRole.MEMBER,
                    TenantRole.OPERATOR,
                    TenantRole.ADMIN,
                  ].map((role) => (
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
                value={field.value ?? []}
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
          <Button type="submit" loading={isPending}>
            {t('Save')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function accessDefaults(
  member: TenantMember,
): UpdateTenantMemberAccessRequestBody {
  return {
    tenantRole: member.tenantRole,
    modules: member.modules.filter(
      (module) =>
        module === TenantModule.CONNECTOR_DEVELOPMENT ||
        module === TenantModule.MCP_SERVICES,
    ),
  };
}
