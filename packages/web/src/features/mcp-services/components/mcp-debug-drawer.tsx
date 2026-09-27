import {
  McpService,
  McpToolDebugResult,
  McpToolParamMode,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Play } from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

import { mcpServicesHooks } from '../hooks/mcp-services-hooks';

function McpDebugDrawer({
  service,
  open,
  onClose,
}: {
  service: McpService;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="flex flex-col gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t('Debug MCP service')}</SheetTitle>
          <SheetDescription>{service.name}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 px-4">
          <DebugBody key={open ? 'open' : 'closed'} service={service} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DebugBody({ service }: { service: McpService }) {
  const [toolId, setToolId] = useState(service.tools[0]?.id ?? '');
  const [values, setValues] = useState<Record<string, string>>({});
  const [clientName, setClientName] = useState('Claude Code');
  const [result, setResult] = useState<McpToolDebugResult | null>(null);
  const { mutate: run, isPending } = mcpServicesHooks.useDebugTool(service.id);
  const tool = service.tools.find((candidate) => candidate.id === toolId);

  if (service.tools.length === 0) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        {t('Add a tool before debugging it')}
      </p>
    );
  }

  const aiParams =
    tool?.params.filter((param) => param.mode === McpToolParamMode.AI) ?? [];

  return (
    <div className="flex flex-col gap-4 py-4">
      <Alert variant="warning">
        <AlertDescription>
          {t('This calls the draft tool for real, as you.')}
        </AlertDescription>
      </Alert>
      <div className="flex flex-col gap-1">
        <Label>{t('Tool')}</Label>
        <Select
          value={toolId}
          onValueChange={(value) => {
            setToolId(value);
            setValues({});
            setResult(null);
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {service.tools.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label>{t('Client name')}</Label>
        <Input
          value={clientName}
          onChange={(event) => setClientName(event.target.value)}
        />
      </div>
      {aiParams.map((param) => (
        <div key={param.name} className="flex flex-col gap-1">
          <Label>
            <span className="font-mono">{param.name}</span>
            {param.description && ` (${param.description})`}
          </Label>
          <Input
            value={values[param.name] ?? ''}
            placeholder={
              param.hint ||
              t('Inferred by the AI in real calls; fill it in for this test')
            }
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                [param.name]: event.target.value,
              }))
            }
          />
        </div>
      ))}
      <Button
        type="button"
        disabled={!tool}
        loading={isPending}
        onClick={() =>
          tool &&
          run(
            {
              toolId: tool.id,
              arguments: values,
              clientName: clientName || undefined,
            },
            { onSuccess: setResult },
          )
        }
      >
        <Play className="size-4 mr-1" />
        {t('Call')}
      </Button>
      {result && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">
              {t('Resolved arguments')}
            </span>
            <pre className="max-h-48 overflow-auto rounded-md border bg-muted p-2 text-xs">
              {JSON.stringify(result.resolvedArguments, null, 2)}
            </pre>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{t('Result')}</span>
              <Badge variant={result.isError ? 'destructive' : 'success'}>
                {result.isError ? t('Error') : t('Success')}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {t('{ms}ms', { ms: result.durationMs })}
              </span>
            </div>
            <pre className="max-h-64 overflow-auto rounded-md border bg-muted p-2 text-xs">
              {result.structured
                ? JSON.stringify(result.structured, null, 2)
                : result.text}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export { McpDebugDrawer };
