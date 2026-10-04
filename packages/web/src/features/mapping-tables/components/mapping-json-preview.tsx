import {
  MappingFieldType,
  MappingIssueSeverity,
  MappingResult,
  MappingSpec,
} from '@fema-ipaas/core-utils';
import { t } from 'i18next';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { mappingIssueText } from '../utils/mapping-issue-text';

export function MappingJsonPreview({
  spec,
  preview,
  hasSample,
}: {
  spec: MappingSpec;
  preview: MappingResult;
  hasSample: boolean;
}) {
  const entries = preview.rows.filter((row) => row.target.trim().length > 0);
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-2"
      data-testid="mapping-json-preview"
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{t('JSON preview')}</span>
        <span className="text-xs text-muted-foreground">
          {hasSample
            ? t(
                'What this step outputs for the sample data you tested in the editor. It updates as you edit.',
              )
            : t(
                'No sample data yet. Test the upstream steps in the editor to see the result here.',
              )}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-xs">
        {entries.length === 0 ? (
          <span className="text-muted-foreground">{'{}'}</span>
        ) : (
          <div data-testid="mapping-json-text">
            <div>{'{'}</div>
            {entries.map((row, index) => {
              const own = preview.issues.filter(
                (found) => found.rowId === row.id,
              );
              const failed = own.some(
                (found) => found.severity === MappingIssueSeverity.ERROR,
              );
              const expected = spec.destination?.fields.find(
                (field) => field.name === row.target.trim(),
              )?.type;
              return (
                <div
                  key={row.id}
                  className={cn(
                    'flex items-start justify-between gap-2 rounded pl-4',
                    failed && 'bg-destructive/10 text-destructive',
                  )}
                  data-testid="mapping-json-entry"
                  data-status={failed ? 'error' : 'ok'}
                >
                  <pre className="whitespace-pre-wrap break-all">
                    {`"${row.target.trim()}": ${indent(
                      row.value === undefined
                        ? 'null'
                        : JSON.stringify(row.value, null, 2) ?? 'null',
                    )}${index < entries.length - 1 ? ',' : ''}`}
                  </pre>
                  <span className="flex shrink-0 gap-1">
                    {expected !== undefined && (
                      <Badge
                        variant="outline"
                        className="px-1 py-0 text-[10px]"
                        title={t('Type the target field needs')}
                      >
                        {mappingIssueText.typeLabel(expected)}
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className="px-1 py-0 text-[10px]"
                      title={t('Type of the value this sample produces')}
                    >
                      {mappingIssueText.typeLabel(actualType(row.value))}
                    </Badge>
                  </span>
                </div>
              );
            })}
            <div>{'}'}</div>
          </div>
        )}
      </div>
      <div
        className="flex max-h-40 flex-col gap-1 overflow-auto"
        data-testid="mapping-json-issues"
      >
        {preview.issues.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            {t('No type errors for this sample.')}
          </span>
        ) : (
          preview.issues.map((found, index) => (
            <span
              key={`${found.code}-${found.target}-${index}`}
              className={cn(
                'text-xs',
                found.severity === MappingIssueSeverity.ERROR
                  ? 'text-destructive'
                  : 'text-warning-700',
              )}
              data-testid="mapping-json-issue"
            >
              {found.target.length > 0 && (
                <span className="font-mono">{found.target}: </span>
              )}
              {mappingIssueText.describe(found)}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function indent(text: string): string {
  return text.split('\n').join('\n  ');
}

function actualType(value: unknown): MappingFieldType {
  if (typeof value === 'string') {
    return MappingFieldType.STRING;
  }
  if (typeof value === 'number') {
    return MappingFieldType.NUMBER;
  }
  if (typeof value === 'boolean') {
    return MappingFieldType.BOOLEAN;
  }
  if (Array.isArray(value)) {
    return MappingFieldType.ARRAY;
  }
  return value === undefined || value === null
    ? MappingFieldType.ANY
    : MappingFieldType.OBJECT;
}
