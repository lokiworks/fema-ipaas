import { ApplicationErrorParams, ErrorCode } from '@fema-ipaas/core-utils';
import {
  AddConnectorRequestBody,
  FlagId,
  PackageType,
  ConnectorScope,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { HttpStatusCode } from 'axios';
import { t } from 'i18next';
import pako from 'pako';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { AnimatedIconButton } from '@/components/custom/animated-icon-button';
import { Markdown } from '@/components/custom/markdown';
import { PlusIcon } from '@/components/icons/plus';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { flagsHooks } from '@/hooks/flags-hooks';
import { api } from '@/lib/api';
import { authenticationSession } from '@/lib/authentication-session';

import { connectorsApi } from '../api/connectors-api';
const FormSchema = z.object({
  packageType: z.nativeEnum(PackageType),
  connectorName: z.string().optional(),
  scope: z.nativeEnum(ConnectorScope),
  connectorVersion: z.string().optional(),
  connectorArchive: z.unknown().optional(),
});

type InstallConnectorDialogProps = {
  onInstallConnector: () => void;
  scope: ConnectorScope;
};
const InstallConnectorDialog = ({
  onInstallConnector,
  scope,
}: InstallConnectorDialogProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const { data: privateConnectorsEnabled } = flagsHooks.useFlag<boolean>(
    FlagId.PRIVATE_CONNECTORS_ENABLED,
  );

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      scope,
      packageType: PackageType.REGISTRY,
    },
  });

  const handleArchiveUpload = async (file: File) => {
    if (file && file.name.endsWith('.tgz')) {
      try {
        const fileBuffer = await file.arrayBuffer();
        const decompressedData = pako.ungzip(new Uint8Array(fileBuffer));
        const text = new TextDecoder().decode(decompressedData);

        // Look for package.json content in the decompressed data
        const packageJsonMatch = text.match(
          /package\.json.*?{[^}]*"name"\s*:\s*"([^"]+)".*?"version"\s*:\s*"([^"]+)"/s,
        );
        if (packageJsonMatch) {
          form.setValue('connectorName', packageJsonMatch[1]);
          form.setValue('connectorVersion', packageJsonMatch[2]);
        } else {
          form.setError('connectorArchive', {
            message: t('package.json not found in archive'),
          });
        }
      } catch (error) {
        console.error('Error processing file:', error);
        form.setError('connectorArchive', {
          message: t('Error processing archive file'),
        });
      }
    } else {
      form.setError('connectorArchive', {
        message: t('Please upload a .tgz file'),
      });
    }
  };

  const { mutate, isPending } = useMutation<
    void,
    Error,
    AddConnectorRequestBody
  >({
    mutationFn: async (data) => {
      form.clearErrors();

      if (data.packageType === PackageType.REGISTRY) {
        if (!data.connectorName) {
          form.setError('connectorName', {
            message: t('Connector name is required for NPM Registry'),
          });
        }
        if (!data.connectorVersion) {
          form.setError('connectorVersion', {
            message: t('Connector version is required for NPM Registry'),
          });
        }
        if (!data.connectorName || !data.connectorVersion) {
          throw new Error('Validation failed');
        }
      }

      await connectorsApi.install(data);
    },
    onSuccess: () => {
      setIsOpen(false);
      form.reset();
      onInstallConnector();
      toast.success(t('Connector installed'), {
        duration: 3000,
      });
    },
    onError: (error) => {
      if (api.isError(error)) {
        if (error.response?.status === HttpStatusCode.Conflict) {
          form.setError('root.serverError', {
            message: t(
              'A connector with this name and version is already installed. Please update the version number in package.json and try again.',
            ),
          });
          return;
        }
        const responseData = error.response?.data as
          | ApplicationErrorParams
          | undefined;
        if (
          responseData?.code === ErrorCode.ENGINE_OPERATION_FAILURE &&
          responseData.params.message
        ) {
          form.setError('root.serverError', {
            message: responseData.params.message,
          });
          return;
        }
        form.setError('root.serverError', {
          message: t('Something went wrong, please try again later'),
        });
      }
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => setIsOpen(open)}>
      <DialogTrigger asChild>
        <AnimatedIconButton icon={PlusIcon} iconSize={16} size="sm">
          {t('Install Connector')}
        </AnimatedIconButton>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Install a connector')}</DialogTitle>
          <DialogDescription>
            <Markdown
              markdown={
                'Use this to install a [custom connector](https://github.com/lokiworks/fema-ipaas/docs/build-connectors/building-connectors/create-action) that you (or someone else) created. Once the connector is installed, you can use it in the workflow builder.\n\nWarning: Make sure you trust the author as the connector will have access to your workflow data and it might not be compatible with the current version of FEMA Integration Tenant.'
              }
            />
          </DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((data) =>
              mutate({
                workspaceId: authenticationSession.getWorkspaceId()!,
                ...data,
              } as AddConnectorRequestBody),
            )}
          >
            <FormField
              name="packageType"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="packageType">
                    {t('Package Type')}
                  </FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value);
                      if (value === PackageType.ARCHIVE) {
                        form.setValue('connectorName', undefined);
                        form.setValue('connectorVersion', undefined);
                      }
                      form.clearErrors();
                    }}
                    defaultValue={PackageType.REGISTRY}
                  >
                    <SelectTrigger>
                      <SelectValue defaultValue={PackageType.REGISTRY} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value={PackageType.REGISTRY}>
                          {t('NPM Registry')}
                        </SelectItem>
                        <SelectItem
                          value={PackageType.ARCHIVE}
                          disabled={!privateConnectorsEnabled}
                        >
                          {t('Packed Archive (.tgz)')}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.watch('packageType') === PackageType.REGISTRY && (
              <>
                <FormField
                  name="connectorName"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="connectorName">
                        {t('Connector Name')}
                      </FormLabel>
                      <Input
                        {...field}
                        value={field.value || ''}
                        id="connectorName"
                        type="text"
                        placeholder="@fema-ipaas/connector-name"
                        className="rounded-sm"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="connectorVersion"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="connectorVersion">
                        {t('Connector Version')}
                      </FormLabel>
                      <Input
                        {...field}
                        value={field.value || ''}
                        id="connectorVersion"
                        type="text"
                        placeholder="0.0.1"
                        className="rounded-sm"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {form.watch('packageType') === PackageType.ARCHIVE && (
              <FormField
                name="connectorArchive"
                control={form.control}
                render={({
                  field: { value: _value, onChange, ...fieldProps },
                }) => (
                  <FormItem>
                    <FormLabel htmlFor="connectorArchive">
                      {t('Package Archive')}
                    </FormLabel>
                    <Input
                      {...fieldProps}
                      id="connectorArchive"
                      type="file"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          onChange(file);
                          handleArchiveUpload(file);
                        }
                      }}
                      placeholder={t('Package archive')}
                      className="rounded-sm"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {form?.formState?.errors?.root?.serverError && (
              <FormMessage>
                {form.formState.errors.root.serverError.message}
              </FormMessage>
            )}
            <Button loading={isPending} type="submit">
              {t('Install')}
            </Button>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
};

export { InstallConnectorDialog };
