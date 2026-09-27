import { ASSIGNABLE_TENANT_MODULES, TenantModule } from '@fema-ipaas/shared';
import { t } from 'i18next';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { tenantAccessUtils } from '@/features/tenant-access';

export function ModuleCheckboxes({
  value,
  onChange,
  isAdmin,
}: {
  value: TenantModule[];
  onChange: (value: TenantModule[]) => void;
  isAdmin: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <FixedModule
        module={TenantModule.BUSINESS_INTEGRATION}
        reason={t('Everyone has business integration')}
      />
      {ASSIGNABLE_TENANT_MODULES.map((module) =>
        isAdmin ? (
          <FixedModule
            key={module}
            module={module}
            reason={t('Admins have every module')}
          />
        ) : (
          <div key={module} className="flex items-center gap-2">
            <Checkbox
              id={`module-${module}`}
              checked={value.includes(module)}
              onCheckedChange={(checked) =>
                onChange(
                  checked === true
                    ? [...value, module]
                    : value.filter((item) => item !== module),
                )
              }
            />
            <Label htmlFor={`module-${module}`}>
              {tenantAccessUtils.moduleLabel(module)}
            </Label>
          </div>
        ),
      )}
      <FixedModule
        module={TenantModule.PLATFORM_ADMIN}
        checked={isAdmin}
        reason={t('Platform administration comes with the admin role')}
      />
    </div>
  );
}

function FixedModule({
  module,
  reason,
  checked = true,
}: {
  module: TenantModule;
  reason: string;
  checked?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex w-fit items-center gap-2">
          <Checkbox checked={checked} disabled />
          <Label className="text-muted-foreground">
            {tenantAccessUtils.moduleLabel(module)}
          </Label>
        </div>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}
