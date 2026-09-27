import {
  DefaultProjectRole,
  Folder,
  FOLDER_LIMIT_PER_PROJECT,
  FOLDER_MAX_DEPTH,
  ProjectTreeWorkflow,
  WorkflowExportFile,
} from '@fema-ipaas/shared';

function parentOf({
  folder,
  ids,
}: {
  folder: Pick<Folder, 'id' | 'parentId'>;
  ids: Set<string>;
}): string | null {
  const parentId = folder.parentId ?? null;
  return parentId !== null && parentId !== folder.id && ids.has(parentId)
    ? parentId
    : null;
}

function folderDepth({
  folderId,
  folders,
}: {
  folderId: string;
  folders: Pick<Folder, 'id' | 'parentId'>[];
}): number {
  const ids = new Set(folders.map((folder) => folder.id));
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const walk = (id: string | null, depth: number, seen: string[]): number => {
    if (id === null || seen.includes(id)) {
      return depth;
    }
    const folder = byId.get(id);
    return folder
      ? walk(parentOf({ folder, ids }), depth + 1, [...seen, id])
      : depth;
  };
  return walk(folderId, 0, []);
}

function subtreeFolderIds({
  folderId,
  folders,
}: {
  folderId: string;
  folders: Pick<Folder, 'id' | 'parentId'>[];
}): string[] {
  const ids = new Set(folders.map((folder) => folder.id));
  const children = folders.filter(
    (folder) => parentOf({ folder, ids }) === folderId,
  );
  return [
    folderId,
    ...children.flatMap((child) =>
      subtreeFolderIds({ folderId: child.id, folders }),
    ),
  ];
}

function buildTreeRows({
  folders,
  workflows,
  query,
  collapsed,
}: {
  folders: Folder[];
  workflows: ProjectTreeWorkflow[];
  query: string;
  collapsed: Set<string>;
}): TreeRow[] {
  const ids = new Set(folders.map((folder) => folder.id));
  const normalizedQuery = query.trim().toLowerCase();
  const matches = (workflow: ProjectTreeWorkflow) =>
    normalizedQuery.length === 0 ||
    workflow.displayName.toLowerCase().includes(normalizedQuery);
  const folderOf = (workflow: ProjectTreeWorkflow) =>
    workflow.folderId && ids.has(workflow.folderId) ? workflow.folderId : null;
  const countIn = (folderId: string) => {
    const scope = new Set(subtreeFolderIds({ folderId, folders }));
    return workflows.filter((workflow) => {
      const owner = folderOf(workflow);
      return owner !== null && scope.has(owner) && matches(workflow);
    }).length;
  };
  const flatten = (parentId: string | null, depth: number): TreeRow[] => [
    ...folders
      .filter((folder) => parentOf({ folder, ids }) === parentId)
      .flatMap((folder): TreeRow[] => {
        const count = countIn(folder.id);
        if (normalizedQuery.length > 0 && count === 0) {
          return [];
        }
        const open = normalizedQuery.length > 0 || !collapsed.has(folder.id);
        return [
          { kind: 'folder', folder, depth, open, count },
          ...(open ? flatten(folder.id, depth + 1) : []),
        ];
      }),
    ...workflows
      .filter(
        (workflow) => folderOf(workflow) === parentId && matches(workflow),
      )
      .map((workflow): TreeRow => ({ kind: 'workflow', workflow, depth })),
  ];
  return flatten(null, 0);
}

function canCreateSubfolder({
  folderId,
  folders,
}: {
  folderId: string | null;
  folders: Pick<Folder, 'id' | 'parentId'>[];
}): { allowed: boolean; reason: FolderBlockReason | null } {
  if (folders.length >= FOLDER_LIMIT_PER_PROJECT) {
    return { allowed: false, reason: 'limit' };
  }
  if (
    folderId !== null &&
    folderDepth({ folderId, folders }) >= FOLDER_MAX_DEPTH
  ) {
    return { allowed: false, reason: 'depth' };
  }
  return { allowed: true, reason: null };
}

function successRate({
  succeeded,
  failed,
}: {
  succeeded: number;
  failed: number;
}): number | null {
  const finished = succeeded + failed;
  return finished === 0 ? null : (succeeded / finished) * 100;
}

function changePercent({
  current,
  previous,
}: {
  current: number;
  previous: number;
}): number | null {
  if (previous === 0) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}

function badgeText(count: number): string {
  return count > 99 ? '99+' : String(count);
}

function parseWorkflowExport(
  text: string,
): { file: WorkflowExportFile } | { error: 'invalidFormat' } {
  const parsed = safeJsonParse(text);
  if (parsed === undefined) {
    return { error: 'invalidFormat' };
  }
  const result = WorkflowExportFile.safeParse(parsed);
  return result.success ? { file: result.data } : { error: 'invalidFormat' };
}

function safeJsonParse(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    return undefined;
  }
}

function exportFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, '_').trim();
  return `${cleaned.length > 0 ? cleaned : 'workflow'}.json`;
}

function uniqueName({
  base,
  taken,
  maxLength,
}: {
  base: string;
  taken: string[];
  maxLength: number;
}): string {
  const used = new Set(taken.map((name) => name.trim().toLowerCase()));
  const first = base.trim().slice(0, maxLength);
  if (!used.has(first.toLowerCase())) {
    return first;
  }
  const stem = first.slice(0, maxLength - 6);
  const candidates = Array.from(
    { length: taken.length + 1 },
    (_, index) => `${stem} (${index + 2})`,
  );
  return (
    candidates.find((candidate) => !used.has(candidate.toLowerCase())) ??
    `${stem} (${taken.length + 2})`
  );
}

function isNameTaken({ name, taken }: { name: string; taken: string[] }) {
  const target = name.trim().toLowerCase();
  return taken.some((existing) => existing.trim().toLowerCase() === target);
}

function canEditRole(role: DefaultProjectRole | null | undefined): boolean {
  return (
    role === DefaultProjectRole.ADMIN || role === DefaultProjectRole.DEVELOPER
  );
}

export const workspaceUtils = {
  folderDepth,
  subtreeFolderIds,
  buildTreeRows,
  canCreateSubfolder,
  successRate,
  changePercent,
  badgeText,
  parseWorkflowExport,
  exportFileName,
  uniqueName,
  isNameTaken,
  canEditRole,
};

export type FolderBlockReason = 'limit' | 'depth';

export type TreeRow =
  | {
      kind: 'folder';
      folder: Folder;
      depth: number;
      open: boolean;
      count: number;
    }
  | { kind: 'workflow'; workflow: ProjectTreeWorkflow; depth: number };
