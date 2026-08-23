import { SeekPage } from '@fema/core-utils';
import { FolderDto, PopulatedFlow } from '@fema/shared';

export type TreeItemType = 'folder' | 'flow' | 'load-more-folder';

export type SelectableItemType = 'folder' | 'flow';

export type SelectedItemsMap = Map<string, SelectableItemType>;

export type TreeItem = {
  id: string;
  type: TreeItemType;
  name: string;
  data: FolderDto | PopulatedFlow | null;
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
  flows: PopulatedFlow[];
};

export type RootPage = {
  flows: SeekPage<PopulatedFlow>;
};
