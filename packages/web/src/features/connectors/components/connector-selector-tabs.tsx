import { Tabs, TabsTrigger, TabsList } from '@/components/ui/tabs';

import {
  ConnectorSelectorTabType,
  useConnectorSelectorTabs,
} from '../stores/connector-selector-tabs-provider';
import { ResolvedConnectorSelectorTab } from '../utils/connector-selector-customization';

export const ConnectorSelectorTabs = ({
  tabs,
}: {
  tabs: ResolvedConnectorSelectorTab[];
}) => {
  const { selectedTab, selectedCustomTabId, setSelectedTab } =
    useConnectorSelectorTabs();
  const selectedTabKey =
    selectedTab === ConnectorSelectorTabType.CUSTOM
      ? selectedCustomTabId ?? ''
      : selectedTab;
  return (
    <Tabs
      value={selectedTabKey}
      onValueChange={(value) => {
        const tab = tabs.find((candidate) => candidate.key === value);
        if (tab) {
          setSelectedTab(tab.type, tab.customTabId ?? null);
        }
      }}
      className="w-full min-w-0"
    >
      <TabsList
        className={`h-full w-full flex gap-1 px-2 justify-start rounded-none bg-background overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]`}
      >
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.key}
            value={tab.key}
            className={`flex flex-col h-full rounded-md flex-1 min-w-[56px] max-w-[85px]
              hover:bg-gray-300/30 dark:hover:bg-gray-300/10
               data-[state=active]:text-primary data-[state=active]:shadow-none
               border-transparent data-[state=active]:border-primary data-[state=active]:active data-[state=active]:bg-transparent
               text-accent-foreground [&>svg]:size-5 [&>svg]:shrink-0`}
          >
            {tab.icon}
            <span className="mt-1.5 text-sm truncate w-full text-center">
              {tab.name}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
};
