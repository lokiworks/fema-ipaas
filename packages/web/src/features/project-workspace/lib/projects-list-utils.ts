import { ProjectDirectoryItem } from '@fema-ipaas/shared';

function filter({
  items,
  tab,
  query,
}: {
  items: ProjectDirectoryItem[];
  tab: 'mine' | 'all';
  query: string;
}): ProjectDirectoryItem[] {
  const normalized = query.trim().toLowerCase();
  return items
    .filter((item) => tab === 'all' || Boolean(item.myRole))
    .filter(
      (item) =>
        normalized.length === 0 ||
        `${item.displayName} ${item.description ?? ''}`
          .toLowerCase()
          .includes(normalized),
    );
}

export const projectsListUtils = { filter };
