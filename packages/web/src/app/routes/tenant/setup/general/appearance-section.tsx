import { isNil } from '@fema-ipaas/core-utils';
import {
  formErrors,
  HEX_COLOR_PATTERN,
  TENANT_BRANDING_LIMITS,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { ChangeEvent, useRef, useState } from 'react';
import { FieldPath, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { tenantApi } from '@/api/tenants-api';
import { ColorPicker } from '@/components/custom/color-picker';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { flagsHooks } from '@/hooks/flags-hooks';
import { tenantHooks } from '@/hooks/tenant-hooks';
import { colorContrast, MIN_UI_CONTRAST } from '@/lib/color-contrast';
import { cn } from '@/lib/utils';

const hexColor = z.string().regex(HEX_COLOR_PATTERN, 'invalidHexColor');

const ThemeColorsSchema = z.object({
  avatar: hexColor,
  'blue-link': hexColor,
  danger: hexColor,
  selection: hexColor,
  primary: z.object({
    dark: hexColor,
    light: hexColor,
    medium: hexColor,
  }),
  warn: z.object({
    default: hexColor,
    light: hexColor,
    dark: hexColor,
  }),
  success: z.object({
    default: hexColor,
    light: hexColor,
  }),
});

const FromSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, formErrors.required)
    .max(TENANT_BRANDING_LIMITS.productNameMaxLength, 'productNameTooLong'),
  welcomeText: z
    .string()
    .max(TENANT_BRANDING_LIMITS.welcomeTextMaxLength, 'welcomeTextTooLong'),
  logoUrl: z.string(),
  iconUrl: z.string(),
  faviconUrl: z.string(),
  color: z.string(),
  customThemeColors: z.boolean(),
  themeColors: ThemeColorsSchema,
});

type FromSchema = z.infer<typeof FromSchema>;

const THEME_COLOR_FIELDS: { name: FieldPath<FromSchema>; label: string }[] = [
  { name: 'themeColors.primary.dark', label: 'Primary Dark' },
  { name: 'themeColors.primary.light', label: 'Primary Light' },
  { name: 'themeColors.primary.medium', label: 'Primary Medium' },
  { name: 'themeColors.danger', label: 'Danger' },
  { name: 'themeColors.warn.default', label: 'Warning' },
  { name: 'themeColors.warn.light', label: 'Warning Light' },
  { name: 'themeColors.warn.dark', label: 'Warning Dark' },
  { name: 'themeColors.success.default', label: 'Success' },
  { name: 'themeColors.success.light', label: 'Success Light' },
  { name: 'themeColors.blue-link', label: 'Link' },
  { name: 'themeColors.avatar', label: 'Avatar' },
  { name: 'themeColors.selection', label: 'Selection' },
];

export const AppearanceSection = () => {
  const { tenant } = tenantHooks.useCurrentTenant();
  const branding = flagsHooks.useWebsiteBranding();

  const form = useForm<FromSchema>({
    defaultValues: {
      name: tenant?.name,
      welcomeText: tenant?.welcomeText ?? '',
      logoUrl: tenant?.fullLogoUrl,
      iconUrl: tenant?.logoIconUrl,
      faviconUrl: tenant?.favIconUrl,
      color: tenant?.primaryColor,
      customThemeColors: !isNil(tenant?.themeColors),
      themeColors: {
        avatar: branding.colors.avatar,
        'blue-link': branding.colors['blue-link'],
        danger: branding.colors.danger,
        selection: branding.colors.selection,
        primary: {
          dark: branding.colors.primary.dark,
          light: branding.colors.primary.light,
          medium: branding.colors.primary.medium,
        },
        warn: {
          default: branding.colors.warn.default,
          light: branding.colors.warn.light,
          dark: branding.colors.warn.dark,
        },
        success: {
          default: branding.colors.success.default,
          light: branding.colors.success.light,
        },
      },
    },
    resolver: zodResolver(FromSchema),
  });
  const logoRef = useRef<HTMLInputElement>(null);
  const iconRef = useRef<HTMLInputElement>(null);
  const faviconRef = useRef<HTMLInputElement>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const { mutate: updateTenant, isPending } = useMutation({
    mutationFn: async () => {
      const logo = logoRef.current?.files?.[0];
      const icon = iconRef.current?.files?.[0];
      const favicon = faviconRef.current?.files?.[0];
      const { name, welcomeText, color, customThemeColors, themeColors } =
        form.getValues();

      const formdata = new FormData();
      formdata.append('name', name);
      formdata.append('welcomeText', welcomeText);
      formdata.append('primaryColor', color);
      formdata.append(
        'themeColors',
        customThemeColors ? JSON.stringify(themeColors) : 'null',
      );
      if (logo) formdata.append('fullLogo', logo);
      if (icon) formdata.append('logoIcon', icon);
      if (favicon) formdata.append('favIcon', favicon);

      await tenantApi.updateWithFormData(formdata, tenant.id);
      window.location.reload();
    },
    onSuccess: () => {
      toast.success(t('Your changes have been saved.'), {
        duration: 3000,
      });
      form.reset(form.getValues());
    },
  });

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Form {...form}>
          <form
            className="grid space-y-4 mt-4"
            onSubmit={form.handleSubmit(() => updateTenant())}
          >
            <div className="max-w-[600px] grid space-y-4">
              <FormField
                name="name"
                render={({ field }) => (
                  <FormItem className="grid space-y-2">
                    <FormLabel htmlFor="name">{t('Product name')}</FormLabel>
                    <Input
                      {...field}
                      required
                      id="name"
                      maxLength={TENANT_BRANDING_LIMITS.productNameMaxLength}
                      placeholder={t('Product name')}
                      className="rounded-sm"
                    />
                    <FormDescription>
                      {t(
                        'Shown on the sign-in page, in emails and in the console. Up to 20 characters.',
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="welcomeText"
                render={({ field }) => (
                  <FormItem className="grid space-y-2">
                    <FormLabel htmlFor="welcomeText">
                      {t('Sign-in welcome text')}
                    </FormLabel>
                    <Input
                      {...field}
                      id="welcomeText"
                      maxLength={TENANT_BRANDING_LIMITS.welcomeTextMaxLength}
                      className="rounded-sm"
                    />
                    <FormDescription>
                      {t(
                        'Shown on the left of the sign-in page. Up to 30 characters; leave empty to hide it.',
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="logoUrl"
                render={() => (
                  <FormItem className="grid space-y-2">
                    <FormLabel htmlFor="logoFile">{t('Logo')}</FormLabel>
                    <div className="flex flex-row gap-2 items-center">
                      <Input
                        type="file"
                        ref={logoRef}
                        defaultFileName={tenant?.fullLogoUrl}
                        accept="image/png,image/svg+xml,image/jpeg"
                        id="logoFile"
                        className="rounded-sm"
                        onChange={(event) => {
                          const file = acceptBrandingFile(event);
                          setLogoPreview(
                            file ? URL.createObjectURL(file) : null,
                          );
                        }}
                      />
                    </div>
                    <FormDescription>
                      {t('PNG, SVG or JPG, at most 256 KB.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                name="iconUrl"
                render={() => (
                  <FormItem className="grid space-y-2">
                    <FormLabel htmlFor="iconFile">{t('Icon')}</FormLabel>
                    <div className="flex flex-row gap-2 items-center">
                      <Input
                        type="file"
                        ref={iconRef}
                        defaultFileName={tenant?.logoIconUrl}
                        accept="image/*"
                        id="iconFile"
                        className="rounded-sm"
                        onChange={acceptBrandingFile}
                      />
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                name="faviconUrl"
                render={() => (
                  <FormItem className="grid space-y-2">
                    <FormLabel htmlFor="faviconUrl">
                      {t('Favicon URL')}
                    </FormLabel>
                    <div className="flex flex-row gap-2 items-center">
                      <Input
                        type="file"
                        ref={faviconRef}
                        defaultFileName={tenant?.favIconUrl}
                        accept="image/*"
                        id="faviconFile"
                        className="rounded-sm"
                        onChange={acceptBrandingFile}
                      />
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="color"
                render={({ field }) => (
                  <FormItem className="grid space-y-2">
                    <FormLabel htmlFor="color">{t('Primary Color')}</FormLabel>
                    <div className="flex flex-row gap-2 items-center">
                      <ColorPicker
                        value={field.value as string}
                        onChange={(color: string) => field.onChange(color)}
                        className="flex flex-row gap-2 items-center"
                      ></ColorPicker>
                      <FormMessage />
                    </div>
                    <PrimaryColorContrast color={String(field.value ?? '')} />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="customThemeColors"
                render={({ field }) => (
                  <FormItem className="grid space-y-2">
                    <FormLabel htmlFor="customThemeColors">
                      {t('Customize theme colors')}
                    </FormLabel>
                    <div className="flex flex-row gap-2 items-center">
                      <Switch
                        id="customThemeColors"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </div>
                    <FormDescription>
                      {t(
                        'When disabled, theme colors are derived from your primary color.',
                      )}
                    </FormDescription>
                  </FormItem>
                )}
              />

              {form.watch('customThemeColors') && (
                <div className="grid grid-cols-3 gap-4">
                  {THEME_COLOR_FIELDS.map(({ name, label }) => (
                    <FormField
                      key={name}
                      control={form.control}
                      name={name}
                      render={({ field }) => (
                        <FormItem className="grid space-y-2">
                          <FormLabel>{t(label)}</FormLabel>
                          <div className="flex flex-row gap-2 items-center">
                            <ColorPicker
                              value={field.value as string}
                              onChange={(color: string) =>
                                field.onChange(color)
                              }
                              className="flex flex-row gap-2 items-center"
                            ></ColorPicker>
                            <FormMessage />
                          </div>
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              )}
            </div>

            {form?.formState?.errors?.root?.serverError && (
              <FormMessage>
                {form.formState.errors.root.serverError.message}
              </FormMessage>
            )}
            <div className="flex gap-2 justify-end mt-4">
              <Button
                type="submit"
                loading={isPending}
                disabled={!form.formState.isValid}
              >
                {t('Save')}
              </Button>
            </div>
          </form>
        </Form>
        <div className="flex flex-col gap-2 pt-4">
          <span className="text-xs text-muted-foreground">
            {t('Sign-in page preview')}
          </span>
          <LoginPreview
            productName={form.watch('name')}
            welcomeText={form.watch('welcomeText')}
            color={form.watch('color')}
            logoUrl={logoPreview ?? tenant?.fullLogoUrl ?? null}
            emailAuthEnabled={tenant?.emailAuthEnabled ?? true}
          />
        </div>
      </div>
    </>
  );
};

function acceptBrandingFile(event: ChangeEvent<HTMLInputElement>): File | null {
  const file = event.target.files?.[0] ?? null;
  if (file && file.size > TENANT_BRANDING_LIMITS.logoMaxBytes) {
    toast.error(t('Logo files must be at most 256 KB'));
    event.target.value = '';
    return null;
  }
  return file;
}

function LoginPreview({
  productName,
  welcomeText,
  color,
  logoUrl,
  emailAuthEnabled,
}: {
  productName: string;
  welcomeText: string;
  color: string;
  logoUrl: string | null;
  emailAuthEnabled: boolean;
}) {
  const buttonColor = colorContrast.isReadableOnWhite(color)
    ? color
    : undefined;
  const name = productName.trim().length > 0 ? productName : t('Product name');
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-lg border text-xs">
      <div className="flex flex-col gap-3 bg-muted p-4">
        <div className="flex items-center gap-2">
          {logoUrl && (
            <img src={logoUrl} alt="" className="size-6 object-contain" />
          )}
          <span className="font-medium">{name}</span>
        </div>
        {welcomeText.trim().length > 0 && (
          <span className="text-sm">{welcomeText}</span>
        )}
      </div>
      <div className="flex flex-col gap-2 p-4">
        <span className="font-medium">
          {t('Sign in to {name}', { name })}
        </span>
        {emailAuthEnabled ? (
          <>
            <div className="h-6 rounded border" />
            <div className="h-6 rounded border" />
            <div
              className="flex h-6 items-center justify-center rounded bg-primary text-primary-foreground"
              style={buttonColor ? { backgroundColor: buttonColor } : undefined}
            >
              {t('Sign in')}
            </div>
          </>
        ) : (
          <span className="text-muted-foreground">
            {t('No sign-in method is turned on')}
          </span>
        )}
      </div>
    </div>
  );
}

function PrimaryColorContrast({ color }: { color: string }) {
  const ratio = colorContrast.ratio({
    foreground: color,
    background: '#ffffff',
  });
  if (ratio === null) {
    return null;
  }
  const readable = colorContrast.isReadableOnWhite(color);
  return (
    <FormDescription className={cn(!readable && 'text-destructive')}>
      {readable
        ? t('Contrast on a white background: {ratio}:1', {
            ratio: ratio.toFixed(2),
          })
        : t(
            'This color is too light to read on a white background ({ratio}:1, needs at least {min}:1).',
            { ratio: ratio.toFixed(2), min: MIN_UI_CONTRAST },
          )}
    </FormDescription>
  );
}
