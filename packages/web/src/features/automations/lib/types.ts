import { SeekPage } from '@fema-ipaas/core-utils';
import { FolderDto, PopulatedWorkflow } from '@fema-ipaas/shared';

export type TreeItemType = 'folder' | 'workflow' | 'load-more-folder';

export type SelectableItemType = 'folder' | 'workflow';

export type SelectedItemsMap = Map<string, SelectableItemType>;

export type TreeItem = {
  id: string;
  type: TreeItemType;
  name: string;
  data: FolderDto | PopulatedWorkflow | null;
  depth: number;
  folderId: string | null;
  childCount?: number;
  loadMoreCount?: number;
};

export type AutomationsFilters = {
  searchTerm: string;
  typeFilter: string[];
  statusFilter: string[];
  connectionFilter: string[];
  ownerFilter: string[];
  folderFilter: string[];
};

export type FolderContent = {
  workflows: PopulatedWorkflow[];
};

export type RootPage = {
  workflows: SeekPage<PopulatedWorkflow>;
};
