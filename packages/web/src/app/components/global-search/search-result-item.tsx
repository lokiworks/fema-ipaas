import { GlobalSearchResultType } from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  ArrowRight,
  Database,
  Dot,
  FolderIcon,
  FolderKanban,
  LayoutTemplate,
  Link2,
  LucideIcon,
  Plug,
  Server,
  Siren,
  TableProperties,
  User,
  Workflow,
} from 'lucide-react';

import { TableIcon } from '@/components/icons/table';
import { WorkflowIcon } from '@/components/icons/workflow';
import { formatUtils } from '@/lib/format-utils';

import { type SearchResultItem } from './use-global-search-results';

type ItemIconProps = {
  type: string;
  resourceType?: GlobalSearchResultType;
  pageIcon?: React.ComponentType<{ className?: string; size?: number }>;
  iconBgColor?: string;
  iconTextColor?: string;
  iconLetter?: string;
};

function ItemIcon({
  type,
  resourceType,
  pageIcon: PageIcon,
  iconBgColor,
  iconTextColor,
  iconLetter,
}: ItemIconProps) {
  if (type === 'project') {
    if (iconBgColor) {
      return (
        <span
          className="flex size-5 shrink-0 items-center justify-center rounded-[4px] text-[10px] font-bold"
          style={{ backgroundColor: iconBgColor, color: iconTextColor }}
        >
          {iconLetter}
        </span>
      );
    }
    return <User className="size-4 shrink-0 text-muted-foreground" />;
  }

  if (type === 'workflow') {
    return (
      <span className="[&_svg]:text-violet-500! shrink-0">
        <WorkflowIcon className="size-4" />
      </span>
    );
  }

  if (type === 'table') {
    return (
      <span className="[&_svg]:text-emerald-500! shrink-0">
        <TableIcon className="size-4" />
      </span>
    );
  }

  if (type === 'folder') {
    return (
      <FolderIcon
        className="size-4 shrink-0 text-muted-foreground"
        fill="currentColor"
        strokeWidth={0}
      />
    );
  }

  if (type === 'page' && PageIcon) {
    return <PageIcon className="size-4 shrink-0 text-muted-foreground" />;
  }

  if (type === 'view-all') {
    return <ArrowRight className="size-4 shrink-0 text-muted-foreground" />;
  }

  if (type === 'resource' && resourceType) {
    const ResourceIcon = RESOURCE_ICONS[resourceType];
    return <ResourceIcon className="size-4 shrink-0 text-muted-foreground" />;
  }

  return null;
}

function ItemMeta({
  projectName,
  folderName,
  updated,
}: {
  projectName?: string | null;
  folderName?: string | null;
  updated?: string | null;
}) {
  const hasProject = !!projectName;
  const hasFolder = !!folderName;
  const hasUpdated = updated != null;

  if (!hasProject && !hasFolder && !hasUpdated) return null;

  return (
    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground/80">
      <span>—</span>
      {hasProject && <span>{projectName}</span>}
      {hasProject && hasFolder && <span>/</span>}
      {hasFolder && (
        <span className="flex items-center gap-0.5">
          <FolderIcon
            className="size-4! mr-0.5 text-muted-foreground/80 shrink-0"
            fill="currentColor"
            strokeWidth={0}
          />
          <span>{folderName}</span>
        </span>
      )}
      {(hasProject || hasFolder) && hasUpdated && (
        <Dot className="size-3! shrink-0 text-muted-foreground/80" />
      )}
      {hasUpdated && (
        <span className="whitespace-nowrap">
          {t('Last modified: {time}', {
            time: formatUtils.formatDateToAgo(new Date(updated!)),
          })}
        </span>
      )}
    </span>
  );
}

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const parts: { text: string; match: boolean }[] = [];
  let lastIndex = 0;
  let idx = lowerText.indexOf(lowerQuery);
  while (idx !== -1) {
    if (idx > lastIndex)
      parts.push({ text: text.slice(lastIndex, idx), match: false });
    parts.push({ text: text.slice(idx, idx + query.length), match: true });
    lastIndex = idx + query.length;
    idx = lowerText.indexOf(lowerQuery, lastIndex);
  }
  if (lastIndex < text.length)
    parts.push({ text: text.slice(lastIndex), match: false });
  return (
    <>
      {parts.map((part, i) =>
        part.match ? (
          <span key={i} className="font-semibold">
            {part.text}
          </span>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

export function SearchResultRow({
  item,
  query,
}: {
  item: SearchResultItem;
  query?: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <ItemIcon
        type={item.type}
        resourceType={item.resourceType}
        pageIcon={item.pageIcon}
        iconBgColor={item.iconBgColor}
        iconTextColor={item.iconTextColor}
        iconLetter={item.iconLetter}
      />
      <span className="min-w-0 shrink truncate text-sm font-normal">
        <HighlightText text={item.label} query={query ?? ''} />
      </span>
      {item.status === 'ENABLED' && (
        <span className="shrink-0 rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-600">
          {t('Live')}
        </span>
      )}
      {item.subtitle && (
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {item.subtitle}
        </span>
      )}
      <ItemMeta
        projectName={item.projectName}
        folderName={item.folderName}
        updated={item.updated}
      />
    </div>
  );
}

const RESOURCE_ICONS: Record<GlobalSearchResultType, LucideIcon> = {
  [GlobalSearchResultType.WORKFLOW]: Workflow,
  [GlobalSearchResultType.PROJECT]: FolderKanban,
  [GlobalSearchResultType.CONNECTION]: Link2,
  [GlobalSearchResultType.CONNECTOR]: Plug,
  [GlobalSearchResultType.MCP_SERVICE]: Server,
  [GlobalSearchResultType.TEMPLATE]: LayoutTemplate,
  [GlobalSearchResultType.DATA_STORE]: Database,
  [GlobalSearchResultType.ISSUE]: Siren,
  [GlobalSearchResultType.MAPPING_TABLE]: TableProperties,
  [GlobalSearchResultType.MCP_SERVER]: Server,
};
