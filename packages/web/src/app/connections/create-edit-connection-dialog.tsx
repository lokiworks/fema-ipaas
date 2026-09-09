import {
  getAuthPropertyForValue,
  ConnectorAuthProperty,
  ConnectorMetadataModel,
  ConnectorMetadataModelSummary,
  PropertyType,
} from '@fema-ipaas/connector-sdk';
import { isNil } from '@fema-ipaas/core-utils';
import {
  FlagId,
  ConnectionScope,
  ConnectionType,
  ConnectionWithoutSensitiveData,
  BOTH_CLIENT_CREDENTIALS_AND_AUTHORIZATION_CODE,
  UpsertConnectionRequestBody,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useState } from 'react';
import { Resolver, useForm } from 'react-hook-form';

import { Markdown } from '@/components/custom/markdown';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormError,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { SkeletonList } from '@/components/ui/skeleton';
import {
  ProjectSelector,
  connectionsMutations,
  oauthAppsQueries,
  oauth2Utils,
  ConnectorsOAuth2AppsMap,
  newConnectionUtils,
} from '@/features/connections';
import { formUtils } from '@/features/connectors';
import { flagsHooks } from '@/hooks/flags-hooks';
import { authenticationSession } from '@/lib/authentication-session';

import { BasicAuthConnectionSettings } from './basic-secret-connection-settings';
import { CustomAuthConnectionSettings } from './custom-auth-connection-settings';
import { MutliAuthList, AuthListItem } from './multi-auth-list';
import { OAuth2ConnectionSettings } from './oauth2-connection-settings';
import { OIDCConnectionSettings } from './oidc-connection-settings';
import { SecretTextConnectionSettings } from './secret-text-connection-settings';

function CreateOrEditConnectionSection({
  connector,
  reconnectConnection,
  isGlobalConnection,
  externalIdComingFromSdk,
  setOpen,
  selectedAuth,
  onTryAnotherMethodButtonClicked,
  showTryAnotherMethodButton,
  projectId: projectIdOverride,
  presentation = 'dialog',
}: CreateOrEditConnectionSectionProps) {
  const isInline = presentation === 'inline';
  const formSchema = formUtils.buildConnectionSchema(
    selectedAuth.authProperty,
    {
      isGlobalConnection,
      showConnectionNameField:
        isNil(externalIdComingFromSdk) || externalIdComingFromSdk === '',
    },
  );
  const { externalId, displayName } = newConnectionUtils.getConnectionName(
    connector,
    reconnectConnection,
    externalIdComingFromSdk,
  );
  const { data: redirectUrl } = flagsHooks.useFlag<string>(
    FlagId.THIRD_PARTY_AUTH_PROVIDER_REDIRECT_URL,
  );
  const { data: publicUrl } = flagsHooks.useFlag<string>(FlagId.PUBLIC_URL);
  const form = useForm<ConnectionFormValues>({
    defaultValues: {
      request: {
        ...newConnectionUtils.createDefaultValues({
          auth: selectedAuth.authProperty,
          suggestedExternalId: externalId,
          suggestedDisplayName: displayName,
          connectorName: connector.name,
          oauth2App: selectedAuth.oauth2App,
          grantType: selectedAuth.grantType,
          redirectUrl: redirectUrl ?? '',
          projectId: projectIdOverride ?? undefined,
        }),
        ...(isGlobalConnection ? { scope: ConnectionScope.TENANT } : {}),
        projectIds: reconnectConnection?.projectIds ?? [],
        preSelectForNewProjects: false,
        connectorVersion: connector.version,
      },
    },
    mode: 'onChange',
    reValidateMode: 'onChange',
    resolver: zodResolver(
      formSchema,
    ) as unknown as Resolver<ConnectionFormValues>,
  });

  const [errorMessage, setErrorMessage] = useState('');

  const { mutate: upsertConnection, isPending } =
    connectionsMutations.useUpsertConnection({
      isGlobalConnection,
      reconnectConnection,
      externalIdComingFromSdk,
      setErrorMessage,
      form,
      setOpen,
    });

  // The OIDC issuer the server signs into the token's `iss` claim is derived from the
  // server's configured public URL (FEMA_FRONTEND_URL), exposed here as the PUBLIC_URL flag —
  // NOT the browser origin, which can differ behind a proxy/custom host and would make the
  // provider URL the user registers in AWS mismatch the token issuer.
  const publicOrigin = publicUrl ?? window.location.origin;
  const oidcIssuerUrl = publicOrigin.replace(/\/$/, '');
  const oidcIssuerHost = oidcIssuerUrl.replace(/^https?:\/\//, '');

  return (
    <>
      {!isInline && (
        <DialogHeader className="mb-0">
          <DialogTitle className="px-5">
            <div className="flex items-center gap-2">
              {reconnectConnection
                ? t('Reconnect {displayName} Connection', {
                    displayName: reconnectConnection.displayName,
                  })
                : t('Connect to {displayName}', {
                    displayName: connector.displayName,
                  })}
            </div>
          </DialogTitle>
          <DialogDescription className="px-5">
            {t(
              'Enter the credentials this workflow will use to reach the app.',
            )}
          </DialogDescription>
        </DialogHeader>
      )}

      <Form {...form}>
        <form className="flex flex-col gap-3">
          <ScrollArea
            className={isInline ? '' : 'px-2'}
            viewPortClassName={
              isInline
                ? 'max-h-[55vh] py-1'
                : 'max-h-[calc(70vh-180px)] px-4 py-2 mb-1'
            }
          >
            {' '}
            <Markdown
              markdown={selectedAuth.authProperty.description}
              variables={{
                redirectUrl: redirectUrl ?? '',
                tenantId: authenticationSession.getTenantId() ?? '',
                projectId: authenticationSession.getProjectId() ?? '',
                frontendUrl: oidcIssuerUrl,
                frontendHost: oidcIssuerHost,
              }}
            ></Markdown>
            {selectedAuth.authProperty.description && (
              <Separator className="my-4" />
            )}
            {(isNil(externalIdComingFromSdk) ||
              externalIdComingFromSdk === '') && (
              <FormField
                name="request.displayName"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="flex flex-col gap-2">
                    <FormLabel htmlFor="displayName" showRequiredIndicator>
                      {t('Connection Name')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        required
                        id="displayName"
                        type="text"
                        placeholder={t('Connection name')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              ></FormField>
            )}
            {isGlobalConnection && isNil(reconnectConnection) && (
              <div className="my-4 flex flex-col gap-4">
                <ProjectSelector
                  control={form.control}
                  name="request.projectIds"
                />
                <FormField
                  control={form.control}
                  name="request.preSelectForNewProjects"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-3">
                      <Checkbox
                        id="preSelectForNewProjects"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                      <Label
                        htmlFor="preSelectForNewProjects"
                        className="cursor-pointer"
                      >
                        {t('Include by default in new projects')}
                      </Label>
                    </FormItem>
                  )}
                />
                {isNil(reconnectConnection) && (
                  <div>
                    <FormField
                      control={form.control}
                      name="request.externalId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('External ID')}</FormLabel>
                          <Input {...field} />
                          <FormMessage />
                        </FormItem>
                      )}
                    ></FormField>
                  </div>
                )}
              </div>
            )}
            <div className="mt-3.5">
              <ConnectionSettings
                selectedAuth={selectedAuth}
                connector={connector}
              />
            </div>
          </ScrollArea>
          {errorMessage && (
            <FormError
              formMessageId="create-connection-server-error-message"
              className={isInline ? 'text-left px-1' : 'text-left px-6'}
            >
              {errorMessage}
            </FormError>
          )}
          {isInline ? (
            <div className="mt-0 flex gap-2 w-full">
              {showTryAnotherMethodButton && (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={onTryAnotherMethodButtonClicked}
                >
                  {t('Try another method')}
                </Button>
              )}
              <div className="grow"></div>
              <Button
                size="sm"
                onClick={(e) => form.handleSubmit(() => upsertConnection())(e)}
                loading={isPending}
                type="submit"
              >
                {reconnectConnection ? t('Reconnect') : t('Connect')}
              </Button>
            </div>
          ) : (
            <DialogFooter className="mt-0">
              <div className="flex w-full gap-2 px-5">
                {showTryAnotherMethodButton && (
                  <Button
                    variant="outline"
                    type="button"
                    onClick={onTryAnotherMethodButtonClicked}
                  >
                    {t('Try another method')}
                  </Button>
                )}
                <div className="grow"></div>
                <DialogClose asChild>
                  <Button variant="outline">{t('Cancel')}</Button>
                </DialogClose>
                <Button
                  onClick={(e) =>
                    form.handleSubmit(() => upsertConnection())(e)
                  }
                  loading={isPending}
                  type="submit"
                >
                  {t('Save')}
                </Button>
              </div>
            </DialogFooter>
          )}
        </form>
      </Form>
    </>
  );
}
function ConnectionSettings({
  selectedAuth,
  connector,
}: ConnectionSettingsProps) {
  switch (selectedAuth.authProperty.type) {
    case PropertyType.SECRET_TEXT:
      return (
        <SecretTextConnectionSettings
          authProperty={selectedAuth.authProperty}
        />
      );
    case PropertyType.BASIC_AUTH:
      return (
        <BasicAuthConnectionSettings authProperty={selectedAuth.authProperty} />
      );
    case PropertyType.CUSTOM_AUTH:
      return (
        <CustomAuthConnectionSettings
          authProperty={selectedAuth.authProperty}
        />
      );
    case PropertyType.OIDC:
      return (
        <OIDCConnectionSettings authProperty={selectedAuth.authProperty} />
      );
    case PropertyType.OAUTH2:
      if (isNil(selectedAuth.grantType) || isNil(selectedAuth.oauth2App)) {
        return <div>Error: Grant type and OAuth2 app are required</div>;
      }
      return (
        <OAuth2ConnectionSettings
          authProperty={selectedAuth.authProperty}
          connector={connector}
          grantType={selectedAuth.grantType}
          oauth2App={selectedAuth.oauth2App}
        />
      );
  }
}

function CreateOrEditConnectionDialogContent(
  props: CreateOrEditConnectionDialogContentProps,
) {
  const connector = props.connector;
  const [selectedAuth, setSelectedAuth] = useState<AuthListItem | null>(
    connector.auth
      ? getInitiallySelectedAuthListItem(
          connector.auth,
          props.reconnectConnection,
          props.connectorsOAuth2AppsMap,
          connector.name,
        )
      : null,
  );
  const [showMultiAuthList, setShowMultiAuthList] = useState(false);
  if (isNil(connector.auth)) {
    return null;
  }
  const hasPredefinedOAuth2App = !isNil(
    oauth2Utils.getPredefinedOAuth2App(
      props.connectorsOAuth2AppsMap,
      connector.name,
    ),
  );
  const hasMultipleAuth =
    Array.isArray(connector.auth) ||
    doesAuthPropertySupportBothGrantTypes(connector.auth) ||
    hasPredefinedOAuth2App;
  return (
    <>
      {!showMultiAuthList && selectedAuth && (
        <CreateOrEditConnectionSection
          {...props}
          selectedAuth={selectedAuth}
          onTryAnotherMethodButtonClicked={() => setShowMultiAuthList(true)}
          showTryAnotherMethodButton={hasMultipleAuth}
        />
      )}
      {showMultiAuthList &&
        hasMultipleAuth &&
        connector.auth &&
        selectedAuth && (
          <MutliAuthList
            connectorName={connector.name}
            connectorsOAuth2AppsMap={props.connectorsOAuth2AppsMap}
            selectedItem={selectedAuth}
            connectorAuth={
              Array.isArray(connector.auth) ? connector.auth : [connector.auth]
            }
            setSelectedItem={setSelectedAuth}
            confirmSelectedItem={() => {
              setShowMultiAuthList(false);
            }}
          />
        )}
    </>
  );
}

CreateOrEditConnectionDialogContent.displayName =
  'CreateOrEditConnectionDialogContent';

function CreateOrEditConnectionDialog({
  connector,
  open,
  setOpen,
  reconnectConnection,
  isGlobalConnection,
  externalIdComingFromSdk,
  projectId: projectIdOverride,
}: ConnectionDialogProps) {
  const {
    data: connectorsOAuth2AppsMap,
    isPending: loadingConnectorsOAuth2AppsMap,
  } = oauthAppsQueries.useConnectorsOAuth2AppsMap();
  return (
    <Dialog
      open={open}
      onOpenChange={(open) => setOpen(open)}
      key={connector.name}
    >
      <DialogContent
        onInteractOutside={(e) => e.preventDefault()}
        className="max-h-[70vh] px-0 w-[calc(100vw-2rem)] sm:min-w-[450px] sm:max-w-[450px] lg:min-w-[650px] lg:max-w-[650px] overflow-y-auto"
      >
        {loadingConnectorsOAuth2AppsMap && hasOAuth2ConnectorAuth(connector) ? (
          <>
            <DialogHeader className="mb-0">
              <DialogTitle className="px-5">
                <div className="flex items-center gap-2">
                  {reconnectConnection
                    ? t('Reconnect {displayName} Connection', {
                        displayName: reconnectConnection.displayName,
                      })
                    : t('Connect to {displayName}', {
                        displayName: connector.displayName,
                      })}
                </div>
              </DialogTitle>
              <DialogDescription className="px-5">
                {t(
                  'Enter the credentials this workflow will use to reach the app.',
                )}
              </DialogDescription>
            </DialogHeader>
            <SkeletonList numberOfItems={4} className="h-7 mt-2"></SkeletonList>
          </>
        ) : (
          <CreateOrEditConnectionDialogContent
            connector={connector}
            connectorsOAuth2AppsMap={connectorsOAuth2AppsMap ?? {}}
            setOpen={setOpen}
            reconnectConnection={reconnectConnection}
            isGlobalConnection={isGlobalConnection}
            externalIdComingFromSdk={externalIdComingFromSdk}
            projectId={projectIdOverride}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
function CreateOrEditConnectionInline({
  connector,
  setOpen,
  reconnectConnection,
  isGlobalConnection,
  externalIdComingFromSdk,
  projectId: projectIdOverride,
}: InlineConnectionProps) {
  const {
    data: connectorsOAuth2AppsMap,
    isPending: loadingConnectorsOAuth2AppsMap,
  } = oauthAppsQueries.useConnectorsOAuth2AppsMap();
  if (loadingConnectorsOAuth2AppsMap && hasOAuth2ConnectorAuth(connector)) {
    return <SkeletonList numberOfItems={4} className="h-7" />;
  }
  return (
    <CreateOrEditConnectionDialogContent
      presentation="inline"
      connector={connector}
      connectorsOAuth2AppsMap={connectorsOAuth2AppsMap ?? {}}
      setOpen={setOpen}
      reconnectConnection={reconnectConnection}
      isGlobalConnection={isGlobalConnection}
      externalIdComingFromSdk={externalIdComingFromSdk}
      projectId={projectIdOverride}
    />
  );
}

CreateOrEditConnectionInline.displayName = 'CreateOrEditConnectionInline';

function hasOAuth2ConnectorAuth(
  connector: ConnectorMetadataModelSummary | ConnectorMetadataModel,
) {
  if (isNil(connector.auth)) {
    return false;
  }
  if (Array.isArray(connector.auth)) {
    return connector.auth.some((auth) => auth.type === PropertyType.OAUTH2);
  }
  return connector.auth.type === PropertyType.OAUTH2;
}

CreateOrEditConnectionDialog.displayName = 'CreateOrEditConnectionDialog';
export {
  CreateOrEditConnectionDialog,
  CreateOrEditConnectionDialogContent,
  CreateOrEditConnectionInline,
};

function getInitallySelectedAuthProperty(
  auth: ConnectorAuthProperty[] | ConnectorAuthProperty,
  reconnectConnection: ConnectionWithoutSensitiveData | null,
): ConnectorAuthProperty | undefined {
  if (Array.isArray(auth)) {
    if (reconnectConnection) {
      return getAuthPropertyForValue({
        authValueType: reconnectConnection.type,
        connectorAuth: auth,
      });
    }
    return auth.at(0);
  }
  return auth;
}

function getInitiallySelectedAuthListItem(
  auth: ConnectorAuthProperty[] | ConnectorAuthProperty,
  reconnectConnection: ConnectionWithoutSensitiveData | null,
  connectorsOAuth2AppsMap: ConnectorsOAuth2AppsMap,
  connectorName: string,
): AuthListItem | null {
  const authProperty = getInitallySelectedAuthProperty(
    auth,
    reconnectConnection,
  );
  if (!authProperty) {
    return null;
  }
  if (authProperty.type === PropertyType.OAUTH2) {
    return {
      authProperty,
      grantType: oauth2Utils.getGrantType(authProperty),
      oauth2App: oauth2Utils.getPredefinedOAuth2App(
        connectorsOAuth2AppsMap,
        connectorName,
      ) ?? {
        oauth2Type: ConnectionType.OAUTH2,
        clientId: null,
      },
    };
  }
  return {
    authProperty,
    grantType: null,
    oauth2App: null,
  };
}
function doesAuthPropertySupportBothGrantTypes(
  authProperty: ConnectorAuthProperty | ConnectorAuthProperty[],
): boolean {
  if (Array.isArray(authProperty)) {
    return authProperty.some(doesAuthPropertySupportBothGrantTypes);
  }
  return (
    authProperty.type === PropertyType.OAUTH2 &&
    authProperty.grantType === BOTH_CLIENT_CREDENTIALS_AND_AUTHORIZATION_CODE
  );
}
type ConnectionDialogProps = {
  connector: ConnectorMetadataModelSummary | ConnectorMetadataModel;
  open: boolean;
  setOpen: (open: boolean, connection?: ConnectionWithoutSensitiveData) => void;
  reconnectConnection: ConnectionWithoutSensitiveData | null;
  isGlobalConnection: boolean;
  externalIdComingFromSdk?: string | null;
  projectId?: string | null;
};

type InlineConnectionProps = Omit<ConnectionDialogProps, 'open'>;

type CreateOrEditConnectionDialogContentProps = {
  connector: ConnectorMetadataModelSummary | ConnectorMetadataModel;
  connectorsOAuth2AppsMap: ConnectorsOAuth2AppsMap;
  reconnectConnection: ConnectionWithoutSensitiveData | null;
  isGlobalConnection: boolean;
  externalIdComingFromSdk?: string | null;
  setOpen: (open: boolean, connection?: ConnectionWithoutSensitiveData) => void;
  projectId?: string | null;
  presentation?: 'dialog' | 'inline';
};

type CreateOrEditConnectionSectionProps =
  CreateOrEditConnectionDialogContentProps & {
    onTryAnotherMethodButtonClicked: () => void;
    showTryAnotherMethodButton: boolean;
    selectedAuth: AuthListItem;
  };

type ConnectionSettingsProps = {
  connector: ConnectorMetadataModelSummary | ConnectorMetadataModel;
  selectedAuth: AuthListItem;
};

type ConnectionFormValues = {
  request: UpsertConnectionRequestBody & {
    projectIds: string[];
    preSelectForNewProjects: boolean;
    scope?: ConnectionScope;
  };
};
