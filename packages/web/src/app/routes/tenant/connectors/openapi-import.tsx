import {
  GenerateConnectorFromOpenApiResponse,
  ParseOpenApiResponse,
} from '@fema-ipaas/shared';
import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { openApiImportApi } from '@/features/openapi-import';

export default function OpenApiImportPage() {
  const [document, setDocument] = useState('');
  const [parsed, setParsed] = useState<ParseOpenApiResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [connectorName, setConnectorName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [generated, setGenerated] =
    useState<GenerateConnectorFromOpenApiResponse | null>(null);

  const parseMutation = useMutation({
    mutationFn: () => openApiImportApi.parse(document),
    onSuccess: (result) => {
      setParsed(result);
      setSelected(
        new Set(result.operations.map((operation) => operation.operationId)),
      );
      setDisplayName((current) => current || result.title);
      setConnectorName(
        (current) =>
          current || `@fema-ipaas/connector-${slugify(result.title)}`,
      );
      setGenerated(null);
    },
    onError: () => toast.error(t('Could not read that OpenAPI document')),
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      openApiImportApi.generate({
        document,
        connectorName,
        displayName,
        operationIds: [...selected],
      }),
    onSuccess: setGenerated,
    onError: () => toast.error(t('Could not generate the connector')),
  });

  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('Import from OpenAPI')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('Turn an internal API description into a connector package.')}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            {t('1. Paste the document')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Textarea
            value={document}
            onChange={(event) => setDocument(event.target.value)}
            placeholder={t('Paste an OpenAPI 3 or Swagger 2 document in JSON')}
            className="h-40 font-mono text-xs"
          />
          <div>
            <Button
              onClick={() => parseMutation.mutate()}
              disabled={document.trim().length === 0}
              loading={parseMutation.isPending}
            >
              {t('Read document')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {parsed && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {t('2. Confirm server and auth')}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex gap-2">
                <span className="text-muted-foreground">{t('Server')}:</span>
                <span className="font-mono text-xs">
                  {parsed.servers[0] ??
                    t('none found — set it after generating')}
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground">{t('Auth')}:</span>
                {parsed.authSchemes.length === 0 ? (
                  <span>{t('none declared')}</span>
                ) : (
                  parsed.authSchemes.map((scheme) => (
                    <Badge key={scheme.name} variant="outline">
                      {scheme.name} · {scheme.type}
                    </Badge>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {t('3. Choose operations')} · {selected.size}/
                {parsed.operations.length}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex max-h-80 flex-col gap-1 overflow-y-auto">
              {parsed.operations.map((operation) => (
                <label
                  key={operation.operationId}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted"
                >
                  <Checkbox
                    checked={selected.has(operation.operationId)}
                    onCheckedChange={() =>
                      setSelected((current) =>
                        toggle(current, operation.operationId),
                      )
                    }
                  />
                  <Badge
                    variant="outline"
                    className="shrink-0 font-mono text-[10px]"
                  >
                    {operation.method}
                  </Badge>
                  <span className="font-mono text-xs">{operation.path}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {operation.summary}
                  </span>
                </label>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {t('4. Name and generate')}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="displayName">{t('Display name')}</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="connectorName">{t('Package name')}</Label>
                  <Input
                    id="connectorName"
                    value={connectorName}
                    onChange={(event) => setConnectorName(event.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
              <div>
                <Button
                  onClick={() => generateMutation.mutate()}
                  disabled={
                    selected.size === 0 || connectorName.trim().length === 0
                  }
                  loading={generateMutation.isPending}
                >
                  {t('Generate connector')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {generated && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {t('5. Generated files')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              {t(
                'Save these under packages/connectors, then run fema connectors validate and fema connectors publish.',
              )}
            </p>
            {Object.entries(generated.files).map(([path, contents]) => (
              <div key={path} className="flex flex-col gap-1">
                <span className="font-mono text-xs text-muted-foreground">
                  {path}
                </span>
                <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
                  {contents}
                </pre>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function toggle(current: Set<string>, value: string): Set<string> {
  const next = new Set(current);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
