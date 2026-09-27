import {
  FlagId,
  formErrors,
  MCP_CONNECTOR_NAME,
  MCP_SERVER_DESCRIPTION_MAX_LENGTH,
  MCP_SERVER_NAME_MAX_LENGTH,
  McpServer,
  McpServerAuthInput,
  McpServerAuthType,
  McpServerProbeResult,
  McpServerStatus,
  McpServerTransport,
  mcpServerUtils,
  UpsertMcpServerRequestBody,
} from '@fema-ipaas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { CircleCheckIcon, LogInIcon, PlugZapIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { Resolver, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { CopyToClipboardInput } from '@/components/custom/clipboard/copy-to-clipboard';
import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectItem,
  MultiSelectList,
  MultiSelectSearch,
  MultiSelectTrigger,
  MultiSelectValue,
} from '@/components/custom/multi-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { connectionsApi } from '@/features/connections/api/connections';
import { oauth2Utils } from '@/features/connections/utils/oauth2-utils';
import { connectorsHooks } from '@/features/connectors';
import { mcpServersMutations } from '@/features/mcp-servers/hooks/mcp-servers-hooks';
import { mcpProbeMessageUtils } from '@/features/mcp-servers/utils/mcp-probe-messages';
import {
  projectDirectoryHooks,
  projectDirectoryUtils,
} from '@/features/projects/api/project-directory-api';
import { useIsTenantAdmin } from '@/hooks/authorization-hooks';
import { flagsHooks } from '@/hooks/flags-hooks';
import { api } from '@/lib/api';
import { authenticationSession } from '@/lib/authentication-session';
import { cn } from '@/lib/utils';

const SCOPE_ALL = 'all';
const SCOPE_PROJECTS = 'projects';

export function McpServerForm({
  existing,
  onDone,
}: {
  existing?: McpServer;
  onDone: (server?: McpServer) => void;
}) {
  const { data: directory } = projectDirectoryHooks.useDirectory();
  const editableProjects = (directory ?? []).filter(
    projectDirectoryUtils.canEdit,
  );
  const isTenantAdmin = useIsTenantAdmin();
  const { summary: mcpConnectorSummary } = connectorsHooks.useConnectorSummary({
    name: MCP_CONNECTOR_NAME,
  });
  const { data: thirdPartyRedirectUrl } = flagsHooks.useFlag<string>(
    FlagId.THIRD_PARTY_AUTH_PROVIDER_REDIRECT_URL,
  );
  const redirectUrl = thirdPartyRedirectUrl ?? 'no_redirect_url_found';

  const keepAuthRef = useRef(false);
  const resolverRef = useRef<Resolver<McpServerFormValues>>(
    (values, context, options) =>
      zodResolver(buildFormSchema({ keepAuth: keepAuthRef.current }))(
        values,
        context,
        options,
      ),
  );

  const form = useForm<McpServerFormValues>({
    resolver: resolverRef.current,
    defaultValues: defaultValuesFor(existing),
    mode: 'onChange',
  });

  const authType = useWatch({ control: form.control, name: 'authType' });
  const scope = useWatch({ control: form.control, name: 'scope' });
  const url = useWatch({ control: form.control, name: 'url' });
  const transport = useWatch({ control: form.control, name: 'transport' });
  const token = useWatch({ control: form.control, name: 'token' });
  const oauthAuthUrl = useWatch({
    control: form.control,
    name: 'oauthAuthUrl',
  });
  const oauthTokenUrl = useWatch({
    control: form.control,
    name: 'oauthTokenUrl',
  });
  const oauthClientId = useWatch({
    control: form.control,
    name: 'oauthClientId',
  });
  const oauthClientSecret = useWatch({
    control: form.control,
    name: 'oauthClientSecret',
  });

  const keepAuth = Boolean(
    existing && existing.authType === authType && existing.authConfigured,
  );
  keepAuthRef.current = keepAuth;

  const [authorizedSignature, setAuthorizedSignature] = useState<string | null>(
    keepAuth
      ? oauthSignature({ oauthAuthUrl, oauthTokenUrl, oauthClientId })
      : null,
  );
  const [oauthCode, setOauthCode] = useState('');
  const [oauthCodeVerifier, setOauthCodeVerifier] = useState<
    string | undefined
  >(undefined);
  const [authorizing, setAuthorizing] = useState(false);
  const [testState, setTestState] = useState<{
    signature: string;
    result: McpServerProbeResult;
  } | null>(null);

  const currentAuthorized =
    authorizedSignature !== null &&
    authorizedSignature ===
      oauthSignature({ oauthAuthUrl, oauthTokenUrl, oauthClientId });
  const currentSignature = JSON.stringify([
    url,
    transport,
    authType,
    token,
    oauthAuthUrl,
    oauthTokenUrl,
    oauthClientId,
    oauthClientSecret,
    currentAuthorized,
    oauthCode,
  ]);
  const [initialSignature] = useState(currentSignature);

  const tested = testState !== null && testState.signature === currentSignature;
  const passed = tested && testState.result.ok;
  const unchangedFromLoad =
    Boolean(existing) && currentSignature === initialSignature;
  const canSave = passed || unchangedFromLoad;

  const testMutation = mcpServersMutations.useTestMcpServer();
  const saveMutation = mcpServersMutations.useSaveMcpServer({
    id: existing?.id,
    onSuccess: (response) => {
      if (response.server.status === McpServerStatus.CONNECTED) {
        toast.success(
          existing
            ? t('Saved')
            : t('Added. Found {count} tools', {
                count: response.server.tools.length,
              }),
        );
      } else {
        toast.success(
          t(
            'Saved. The connection is still not working; retry from the detail page once it recovers',
          ),
        );
      }
      onDone(response.server);
    },
    onError: (error) => {
      form.setError('root.serverError', {
        type: 'manual',
        message: extractErrorMessage(error),
      });
    },
  });

  const authFieldsToValidate: (keyof McpServerFormValues)[] = [
    'url',
    'transport',
    'authType',
    'token',
    'oauthAuthUrl',
    'oauthTokenUrl',
    'oauthClientId',
    'oauthClientSecret',
  ];

  const buildAuthInput = (): McpServerAuthInput => {
    if (authType === McpServerAuthType.NONE) {
      return { type: McpServerAuthType.NONE };
    }
    if (authType === McpServerAuthType.BEARER) {
      return {
        type: McpServerAuthType.BEARER,
        token: token.trim().length > 0 ? token.trim() : undefined,
      };
    }
    return {
      type: McpServerAuthType.OAUTH2,
      authUrl: oauthAuthUrl.trim().length > 0 ? oauthAuthUrl.trim() : undefined,
      tokenUrl:
        oauthTokenUrl.trim().length > 0 ? oauthTokenUrl.trim() : undefined,
      clientId:
        oauthClientId.trim().length > 0 ? oauthClientId.trim() : undefined,
      clientSecret:
        oauthClientSecret.trim().length > 0
          ? oauthClientSecret.trim()
          : undefined,
      code: currentAuthorized ? oauthCode : undefined,
      codeVerifier: currentAuthorized ? oauthCodeVerifier : undefined,
      redirectUrl: currentAuthorized ? redirectUrl : undefined,
    };
  };

  const handleTest = async () => {
    const valid = await form.trigger(authFieldsToValidate);
    if (!valid) {
      return;
    }
    const values = form.getValues();
    const signatureAtStart = currentSignature;
    try {
      const result = await testMutation.mutateAsync({
        projectId: authenticationSession.getProjectId()!,
        serverId: existing?.id,
        url: values.url,
        transport: values.transport,
        auth: buildAuthInput(),
      });
      setTestState({ signature: signatureAtStart, result });
    } catch (error) {
      toast.error(extractErrorMessage(error));
    }
  };

  const canAuthorize =
    oauthAuthUrl.trim().length > 0 &&
    oauthTokenUrl.trim().length > 0 &&
    oauthClientId.trim().length > 0 &&
    oauthClientSecret.trim().length > 0;

  const handleAuthorize = async () => {
    const valid = await form.trigger([
      'oauthAuthUrl',
      'oauthTokenUrl',
      'oauthClientId',
      'oauthClientSecret',
    ]);
    if (!valid || !canAuthorize) {
      return;
    }
    setAuthorizing(true);
    try {
      const { authorizationUrl, codeVerifier } =
        await connectionsApi.getOAuth2AuthorizationUrl({
          connectorName: MCP_CONNECTOR_NAME,
          connectorVersion: mcpConnectorSummary?.version,
          clientId: oauthClientId.trim(),
          redirectUrl,
          props: {
            url: url.trim(),
            transport,
            authUrl: oauthAuthUrl.trim(),
            tokenUrl: oauthTokenUrl.trim(),
          },
        });
      const { code } = await oauth2Utils.openOAuth2Popup({
        authorizationUrl,
        redirectUrl,
        codeVerifier,
      });
      setOauthCode(code);
      setOauthCodeVerifier(codeVerifier);
      setAuthorizedSignature(
        oauthSignature({ oauthAuthUrl, oauthTokenUrl, oauthClientId }),
      );
      toast.success(t('Authorization complete'));
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setAuthorizing(false);
    }
  };

  const submit = (saveWithoutPassingTest: boolean) =>
    form.handleSubmit((values) => {
      form.clearErrors('root.serverError');
      const request: UpsertMcpServerRequestBody = {
        projectId: authenticationSession.getProjectId()!,
        displayName: values.displayName.trim(),
        description: values.description.trim(),
        url: values.url.trim(),
        transport: values.transport,
        auth: buildAuthInput(),
        allProjects: values.scope === SCOPE_ALL,
        projectIds: values.scope === SCOPE_ALL ? [] : values.projectIds,
        saveWithoutPassingTest,
      };
      saveMutation.mutate(request);
    })();

  return (
    <Form {...form}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(false);
        }}
        className="flex min-h-0 flex-1 flex-col gap-4"
      >
        <ScrollArea className="min-h-0 flex-1 pr-2">
          <div className="flex flex-col gap-4 pb-1">
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel showRequiredIndicator>{t('Name')}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      autoFocus={!existing}
                      maxLength={MCP_SERVER_NAME_MAX_LENGTH}
                      placeholder={t('e.g. Internal knowledge base')}
                    />
                  </FormControl>
                  <div className="text-right text-xs text-muted-foreground">
                    {field.value.length}/{MCP_SERVER_NAME_MAX_LENGTH}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Description')}</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={2}
                      maxLength={MCP_SERVER_DESCRIPTION_MAX_LENGTH}
                      placeholder={t(
                        'What this server can do, so colleagues know whether to use it',
                      )}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel showRequiredIndicator>
                    {t('Server address')}
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      className="font-mono"
                      placeholder="https://mcp.your-company.com/mcp"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'The worker reaches this address from its own network. localhost only works on your own computer.',
                    )}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="transport"
              render={({ field }) => (
                <FormItem>
                  <FormLabel showRequiredIndicator>{t('Transport')}</FormLabel>
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    className="grid grid-cols-2 gap-2"
                  >
                    <TransportOption
                      value={McpServerTransport.STREAMABLE_HTTP}
                      label={t('Streamable HTTP')}
                      description={t('The current MCP protocol, recommended')}
                    />
                    <TransportOption
                      value={McpServerTransport.SSE}
                      label={t('SSE')}
                      description={t(
                        'The legacy protocol some servers still require',
                      )}
                    />
                  </RadioGroup>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="authType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel showRequiredIndicator>
                    {t('Authentication')}
                  </FormLabel>
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    className="flex flex-row gap-4"
                  >
                    <AuthTypeOption
                      value={McpServerAuthType.NONE}
                      label={t('None')}
                    />
                    <AuthTypeOption
                      value={McpServerAuthType.BEARER}
                      label={t('Bearer token')}
                    />
                    <AuthTypeOption
                      value={McpServerAuthType.OAUTH2}
                      label={t('OAuth 2.0')}
                    />
                  </RadioGroup>
                </FormItem>
              )}
            />
            {authType === McpServerAuthType.NONE && (
              <Alert variant="warning">
                <AlertDescription>
                  {t(
                    'Without authentication, anyone who can reach this address can call its tools. Only use this for servers on a private network with other access controls.',
                  )}
                </AlertDescription>
              </Alert>
            )}
            {authType === McpServerAuthType.BEARER && (
              <FormField
                control={form.control}
                name="token"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel showRequiredIndicator={!keepAuth}>
                      {t('Token')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        className="font-mono"
                        placeholder={
                          keepAuth
                            ? t('Already configured, leave blank to keep it')
                            : t('Paste the token issued by the server')
                        }
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        'Sent as the Authorization: Bearer header on every call, stored encrypted.',
                      )}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {authType === McpServerAuthType.OAUTH2 && (
              <div className="flex flex-col gap-4 rounded-md border p-3">
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="oauthAuthUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel showRequiredIndicator={!keepAuth}>
                          {t('Authorization URL')}
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className="font-mono"
                            placeholder={
                              keepAuth
                                ? t(
                                    'Already configured, leave blank to keep it',
                                  )
                                : 'https://sso.your-company.com/oauth/authorize'
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="oauthTokenUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel showRequiredIndicator={!keepAuth}>
                          {t('Token URL')}
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className="font-mono"
                            placeholder={
                              keepAuth
                                ? t(
                                    'Already configured, leave blank to keep it',
                                  )
                                : 'https://sso.your-company.com/oauth/token'
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="oauthClientId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel showRequiredIndicator={!keepAuth}>
                          {t('Client ID')}
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className="font-mono"
                            placeholder={
                              keepAuth
                                ? t(
                                    'Already configured, leave blank to keep it',
                                  )
                                : undefined
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="oauthClientSecret"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel showRequiredIndicator={!keepAuth}>
                          {t('Client Secret')}
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            className="font-mono"
                            placeholder={
                              keepAuth
                                ? t(
                                    'Already configured, leave blank to keep it',
                                  )
                                : undefined
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <FormLabel>{t('Redirect URL')}</FormLabel>
                  <p className="text-xs text-muted-foreground">
                    {t('Register this address with the authorization server')}
                  </p>
                  <CopyToClipboardInput textToCopy={redirectUrl} useInput />
                </div>
                <div className="flex items-center gap-3">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={canAuthorize ? undefined : 0}>
                        <Button
                          type="button"
                          variant="outline"
                          loading={authorizing}
                          disabled={!canAuthorize}
                          onClick={handleAuthorize}
                        >
                          <LogInIcon className="mr-1 size-4" />
                          {currentAuthorized
                            ? t('Re-authorize')
                            : t('Authorize')}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!canAuthorize && (
                      <TooltipContent>
                        {t(
                          'Fill in the authorization URL, token URL, client ID and client secret first',
                        )}
                      </TooltipContent>
                    )}
                  </Tooltip>
                  {currentAuthorized && (
                    <span className="flex items-center gap-1 text-sm text-success-700">
                      <CircleCheckIcon className="size-4" />
                      {t('Authorized')}
                    </span>
                  )}
                </div>
              </div>
            )}
            <FormField
              control={form.control}
              name="scope"
              render={({ field }) => (
                <FormItem>
                  <FormLabel showRequiredIndicator>
                    {t('Available projects')}
                  </FormLabel>
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    className="flex flex-col gap-2"
                  >
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value={SCOPE_PROJECTS} />
                      {t('Specific projects')}
                    </label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <label
                          className="flex items-center gap-2 text-sm aria-disabled:opacity-60"
                          aria-disabled={!isTenantAdmin}
                        >
                          <RadioGroupItem
                            value={SCOPE_ALL}
                            disabled={!isTenantAdmin}
                          />
                          {t('All projects')}
                        </label>
                      </TooltipTrigger>
                      {!isTenantAdmin && (
                        <TooltipContent>
                          {t(
                            'Only tenant admins can open a server to all projects',
                          )}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </RadioGroup>
                  {scope === SCOPE_PROJECTS && (
                    <FormField
                      control={form.control}
                      name="projectIds"
                      render={({ field: projectIdsField }) => (
                        <FormItem>
                          <MultiSelect
                            value={projectIdsField.value}
                            onValueChange={projectIdsField.onChange}
                            items={editableProjects.map((project) => ({
                              value: project.id,
                              label: project.displayName,
                            }))}
                          >
                            <MultiSelectTrigger>
                              <MultiSelectValue
                                placeholder={t('Select projects')}
                              />
                            </MultiSelectTrigger>
                            <MultiSelectContent>
                              <MultiSelectSearch placeholder={t('Search...')} />
                              <MultiSelectList>
                                {editableProjects.map((project) => (
                                  <MultiSelectItem
                                    key={project.id}
                                    value={project.id}
                                  >
                                    {project.displayName}
                                  </MultiSelectItem>
                                ))}
                              </MultiSelectList>
                            </MultiSelectContent>
                          </MultiSelect>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </FormItem>
              )}
            />
            <div className="flex flex-col gap-2 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  loading={testMutation.isPending}
                  onClick={handleTest}
                >
                  <PlugZapIcon className="mr-1 size-4" />
                  {t('Test connection')}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {unchangedFromLoad && !tested
                    ? t(
                        'Connection settings are unchanged; you can save directly',
                      )
                    : t(
                        'The worker really connects to the server and reads its tool list',
                      )}
                </span>
              </div>
              {tested && testState !== null && !testState.result.ok && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {mcpProbeMessageUtils.failureMessage(
                      testState.result.error,
                    )}
                  </AlertDescription>
                </Alert>
              )}
              {tested && testState !== null && testState.result.ok && (
                <div className="flex flex-col gap-2">
                  <Alert variant="success">
                    <AlertDescription>
                      {mcpProbeMessageUtils.successMessage({
                        toolCount: testState.result.tools.length,
                        latencyMs: testState.result.latencyMs,
                      })}
                    </AlertDescription>
                  </Alert>
                  {testState.result.insecureHttp && (
                    <Alert variant="warning">
                      <AlertDescription>
                        {mcpProbeMessageUtils.insecureHttpWarning()}
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="flex flex-col gap-1">
                    {testState.result.tools.map((tool) => (
                      <div
                        key={tool.name}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span className="font-medium">
                          {tool.title ?? tool.name}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {tool.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {form.formState.errors.root?.serverError && (
              <FormMessage>
                {form.formState.errors.root.serverError.message}
              </FormMessage>
            )}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onDone()}>
            {t('Cancel')}
          </Button>
          {tested && !passed && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => submit(true)}
              loading={saveMutation.isPending}
            >
              {t('Save now, retry later')}
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={canSave ? undefined : 0}>
                <Button
                  type="submit"
                  disabled={!canSave}
                  loading={saveMutation.isPending}
                >
                  {existing ? t('Save') : t('Save and connect')}
                </Button>
              </span>
            </TooltipTrigger>
            {!canSave && (
              <TooltipContent>
                {t('The connection test must pass before you can save')}
              </TooltipContent>
            )}
          </Tooltip>
        </DialogFooter>
      </form>
    </Form>
  );
}

function TransportOption({
  value,
  label,
  description,
}: {
  value: McpServerTransport;
  label: string;
  description: string;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer flex-col gap-1 rounded-md border p-3 text-sm',
        'has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5',
      )}
    >
      <div className="flex items-center gap-2">
        <RadioGroupItem value={value} />
        <span className="font-medium">{label}</span>
      </div>
      <span className="text-xs text-muted-foreground">{description}</span>
    </label>
  );
}

function AuthTypeOption({
  value,
  label,
}: {
  value: McpServerAuthType;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <RadioGroupItem value={value} />
      {label}
    </label>
  );
}

function oauthSignature({
  oauthAuthUrl,
  oauthTokenUrl,
  oauthClientId,
}: {
  oauthAuthUrl: string;
  oauthTokenUrl: string;
  oauthClientId: string;
}): string {
  return JSON.stringify([oauthAuthUrl, oauthTokenUrl, oauthClientId]);
}

function defaultValuesFor(existing?: McpServer): McpServerFormValues {
  if (!existing) {
    return {
      displayName: '',
      description: '',
      url: '',
      transport: McpServerTransport.STREAMABLE_HTTP,
      authType: McpServerAuthType.BEARER,
      token: '',
      oauthAuthUrl: '',
      oauthTokenUrl: '',
      oauthClientId: '',
      oauthClientSecret: '',
      scope: SCOPE_PROJECTS,
      projectIds: [],
    };
  }
  return {
    displayName: existing.displayName,
    description: existing.description,
    url: existing.url,
    transport: existing.transport,
    authType: existing.authType,
    token: '',
    oauthAuthUrl: '',
    oauthTokenUrl: '',
    oauthClientId: '',
    oauthClientSecret: '',
    scope: existing.allProjects ? SCOPE_ALL : SCOPE_PROJECTS,
    projectIds: existing.projectIds,
  };
}

function buildFormSchema({ keepAuth }: { keepAuth: boolean }) {
  return z
    .object({
      displayName: z
        .string()
        .trim()
        .min(1, formErrors.required)
        .max(MCP_SERVER_NAME_MAX_LENGTH, 'mcpServerNameTooLong'),
      description: z
        .string()
        .trim()
        .max(MCP_SERVER_DESCRIPTION_MAX_LENGTH, 'mcpServerDescriptionTooLong'),
      url: z
        .string()
        .trim()
        .min(1, formErrors.required)
        .refine((value) => mcpServerUtils.validateUrl(value) === null, {
          message: 'mcpServerUrlInvalid',
        }),
      transport: z.enum(McpServerTransport),
      authType: z.enum(McpServerAuthType),
      token: z.string(),
      oauthAuthUrl: z.string(),
      oauthTokenUrl: z.string(),
      oauthClientId: z.string(),
      oauthClientSecret: z.string(),
      scope: z.enum([SCOPE_ALL, SCOPE_PROJECTS]),
      projectIds: z.array(z.string()),
    })
    .superRefine((values, ctx) => {
      if (
        values.authType === McpServerAuthType.BEARER &&
        !keepAuth &&
        values.token.trim().length === 0
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['token'],
          message: formErrors.required,
        });
      }
      if (values.authType === McpServerAuthType.OAUTH2 && !keepAuth) {
        for (const [key, value] of [
          ['oauthAuthUrl', values.oauthAuthUrl],
          ['oauthTokenUrl', values.oauthTokenUrl],
        ] as const) {
          if (value.trim().length === 0) {
            ctx.addIssue({
              code: 'custom',
              path: [key],
              message: formErrors.required,
            });
          } else if (mcpServerUtils.validateUrl(value) !== null) {
            ctx.addIssue({
              code: 'custom',
              path: [key],
              message: 'mcpServerUrlInvalid',
            });
          }
        }
        if (values.oauthClientId.trim().length === 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['oauthClientId'],
            message: formErrors.required,
          });
        }
        if (values.oauthClientSecret.trim().length === 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['oauthClientSecret'],
            message: formErrors.required,
          });
        }
      }
      if (values.scope === SCOPE_PROJECTS && values.projectIds.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['projectIds'],
          message: 'connectionScopeProjectRequired',
        });
      }
    });
}

function extractErrorMessage(error: unknown): string {
  return api.extractServerErrorMessage(
    error,
    'Something went wrong, please try again',
  );
}

type McpServerFormValues = {
  displayName: string;
  description: string;
  url: string;
  transport: McpServerTransport;
  authType: McpServerAuthType;
  token: string;
  oauthAuthUrl: string;
  oauthTokenUrl: string;
  oauthClientId: string;
  oauthClientSecret: string;
  scope: typeof SCOPE_ALL | typeof SCOPE_PROJECTS;
  projectIds: string[];
};
