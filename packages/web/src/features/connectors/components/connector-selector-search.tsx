import { t } from 'i18next';
import { ArrowLeftIcon } from 'lucide-react';

import { SearchInput } from '@/components/custom/search-input';
import { Button } from '@/components/ui/button';
import { useConnectorSearchContext } from '@/features/connectors/stores/connector-search-context';
import {
  ConnectorSelectorTabType,
  useConnectorSelectorTabs,
} from '@/features/connectors/stores/connector-selector-tabs-provider';

type ConnectorsSearchInputProps = {
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onSearchChange: (query: string) => void;
};

const ConnectorsSearchInput = ({
  searchInputRef,
  onSearchChange,
}: ConnectorsSearchInputProps) => {
  const { searchQuery, setSearchQuery } = useConnectorSearchContext();
  const {
    resetToBeforeNoneWasSelected: resetToPreviousValue,
    setSelectedTab,
    selectedConnectorInExplore,
    selectedTab,
    setSelectedConnectorInExplore,
  } = useConnectorSelectorTabs();
  const showBackButton =
    selectedConnectorInExplore &&
    selectedTab === ConnectorSelectorTabType.EXPLORE;
  return (
    <div className="p-2 flex gap-2 items-center">
      {showBackButton && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setSelectedConnectorInExplore(null);
          }}
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
      )}
      <SearchInput
        placeholder={t('Search')}
        value={searchQuery}
        data-testid="connectors-search-input"
        ref={searchInputRef}
        onChange={(e) => {
          setSearchQuery(e);
          onSearchChange(e);
          if (e === '') {
            resetToPreviousValue();
          } else {
            setSelectedTab(ConnectorSelectorTabType.NONE);
          }
        }}
      />
    </div>
  );
};
ConnectorsSearchInput.displayName = 'ConnectorsSearchInput';
export { ConnectorsSearchInput };
