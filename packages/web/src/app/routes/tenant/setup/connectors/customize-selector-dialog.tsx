import { ConnectorMetadataModelSummary } from '@fema-ipaas/connector-sdk';
import {
  apId,
  ConnectorSelectorTabConfig,
  ConnectorSelectorTabSection,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  CheckIcon,
  ChevronDownIcon,
  EyeIcon,
  EyeOffIcon,
  GripVerticalIcon,
  PlusIcon,
  PuzzleIcon,
  Settings2Icon,
  TrashIcon,
  XIcon,
} from 'lucide-react';
import { ReactNode, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Sortable,
  SortableDragHandle,
  SortableItem,
} from '@/components/ui/sortable';
import {
  ConnectorIcon,
  connectorSelectorCustomization,
  CONNECTOR_SELECTOR_TAB_ICON_OPTIONS,
  connectorsHooks,
} from '@/features/connectors';
import { tenantConnectorsMutations } from '@/features/tenant-admin';
import { tenantHooks } from '@/hooks/tenant-hooks';
import { cn } from '@/lib/utils';

const borderlessInputClass =
  'border-transparent bg-transparent shadow-none hover:border-input focus-visible:bg-background';

export const CustomizeSelectorDialog = ({
  isEnabled,
}: {
  isEnabled: boolean;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" disabled={!isEnabled}>
          <Settings2Icon className="size-4 mr-2" />
          {t('Customize Selector')}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col gap-0 p-0"
      >
        <SelectorTabsEditor
          key={open ? 'open' : 'closed'}
          onClose={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
};

const SelectorTabsEditor = ({ onClose }: { onClose: () => void }) => {
  const { tenant, refetch } = tenantHooks.useCurrentTenant();
  const [tabs, setTabs] = useState<ConnectorSelectorTabConfig[]>(
    tenant.connectorSelectorConfig?.tabs.length
      ? tenant.connectorSelectorConfig.tabs
      : connectorSelectorCustomization.getDefaultTabConfigs(),
  );
  const { connectors } = connectorsHooks.useConnectors({
    includeHidden: true,
  });
  const saveMutation =
    tenantConnectorsMutations.useUpdateConnectorSelectorConfig({
      tenantId: tenant.id,
      refetch,
    });

  const updateTab = (id: string, patch: Partial<ConnectorSelectorTabConfig>) =>
    setTabs((prev) =>
      prev.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)),
    );

  const removeTab = (id: string) =>
    setTabs((prev) => prev.filter((tab) => tab.id !== id));

  const addCustomTab = () =>
    setTabs((prev) => [
      ...prev,
      {
        id: apId(),
        kind: 'CUSTOM',
        title: '',
        icon: connectorSelectorCustomization.getRandomIconKey(),
        hidden: false,
        connectorNames: [],
        sections: [],
      },
    ]);

  const handleSave = () => {
    const normalizedTabs = tabs.map((tab) => {
      const trimmedTitle = (tab.title ?? '').trim();
      const sections = (tab.sections ?? [])
        .map((section) => ({ ...section, title: section.title.trim() }))
        .filter(
          (section) =>
            section.title !== '' || section.connectorNames.length > 0,
        );
      return {
        ...tab,
        title: trimmedTitle === '' ? undefined : trimmedTitle,
        ...(tab.kind === 'CUSTOM' ? { sections } : {}),
      };
    });
    const customTabWithoutName = normalizedTabs.some(
      (tab) => tab.kind === 'CUSTOM' && !tab.title,
    );
    if (customTabWithoutName) {
      toast.error(t('Custom tabs must have a name'));
      return;
    }
    const sectionWithoutName = normalizedTabs.some((tab) =>
      (tab.sections ?? []).some((section) => section.title === ''),
    );
    if (sectionWithoutName) {
      toast.error(t('Sections must have a name'));
      return;
    }
    saveMutation.mutate({ tabs: normalizedTabs }, { onSuccess: onClose });
  };

  return (
    <>
      <SheetHeader className="px-6 pt-6 pb-4">
        <SheetTitle>{t('Customize Connector Selector')}</SheetTitle>
        <SheetDescription>
          {t(
            'Reorder, rename, hide tabs, or add custom tabs to highlight specific connectors in the workflow builder.',
          )}
        </SheetDescription>
      </SheetHeader>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 px-6 py-2">
          <Sortable value={tabs} onValueChange={setTabs}>
            <div className="flex flex-col gap-2">
              {tabs.map((tab) => (
                <SortableItem key={tab.id} value={tab.id} asChild>
                  <div>
                    <TabCard
                      tab={tab}
                      connectors={connectors ?? []}
                      onChange={(patch) => updateTab(tab.id, patch)}
                      onRemove={() => removeTab(tab.id)}
                    />
                  </div>
                </SortableItem>
              ))}
            </div>
          </Sortable>

          <Button
            variant="outline"
            size="sm"
            className="self-start text-muted-foreground mt-1"
            onClick={addCustomTab}
          >
            <PlusIcon className="size-4 mr-2" />
            {t('Add custom tab')}
          </Button>
        </div>
      </ScrollArea>

      <SheetFooter className="flex-row justify-between px-6 py-4 border-t">
        <ConfirmationDeleteDialog
          title={t('Reset to default?')}
          message={t(
            'The connector selector will return to its default layout.',
          )}
          warning={t(
            'All your custom tabs and sections will be permanently removed.',
          )}
          buttonText={t('Reset')}
          entityName={t('customization')}
          mutationFn={async () => {
            await saveMutation.mutateAsync(null);
            onClose();
          }}
        >
          <Button variant="ghost">{t('Reset to default')}</Button>
        </ConfirmationDeleteDialog>
        <Button onClick={handleSave} loading={saveMutation.isPending}>
          {t('Save')}
        </Button>
      </SheetFooter>
    </>
  );
};

const TabCard = ({
  tab,
  connectors,
  onChange,
  onRemove,
}: {
  tab: ConnectorSelectorTabConfig;
  connectors: ConnectorMetadataModelSummary[];
  onChange: (patch: Partial<ConnectorSelectorTabConfig>) => void;
  onRemove: () => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const display = connectorSelectorCustomization.getBuiltinTabDisplay(
    tab.builtinTab,
  );
  const iconNode = connectorSelectorCustomization.renderIcon(tab.icon) ??
    connectorSelectorCustomization.renderIcon(display?.defaultIconKey) ?? (
      <PuzzleIcon className="size-5" />
    );
  const placeholder = display ? t(display.defaultLabel) : t('Tab name');
  const sections = tab.sections ?? [];
  const isCustom = tab.kind === 'CUSTOM';

  const addSection = () =>
    onChange({
      sections: [...sections, { id: apId(), title: '', connectorNames: [] }],
    });

  const updateSection = (
    sectionId: string,
    patch: Partial<ConnectorSelectorTabSection>,
  ) =>
    onChange({
      sections: sections.map((section) =>
        section.id === sectionId ? { ...section, ...patch } : section,
      ),
    });

  const removeSection = (sectionId: string) =>
    onChange({
      sections: sections.filter((section) => section.id !== sectionId),
    });

  return (
    <div
      className={cn(
        'rounded-lg border bg-card transition-colors',
        tab.hidden && 'opacity-60',
        expanded && 'border-primary/40',
      )}
    >
      <div className="flex items-center gap-1.5 p-2">
        <SortableDragHandle
          variant="ghost"
          size="icon"
          className="shrink-0 size-7 text-muted-foreground/50"
        >
          <GripVerticalIcon className="size-4" />
        </SortableDragHandle>

        <TabIconPicker
          value={tab.icon}
          iconNode={iconNode}
          onChange={(icon) => onChange({ icon })}
        />

        <Input
          value={tab.title ?? ''}
          placeholder={placeholder}
          onChange={(e) => onChange({ title: e.target.value })}
          className={cn(borderlessInputClass, 'h-8 flex-1 font-medium')}
        />

        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 size-7 text-muted-foreground"
          onClick={() => onChange({ hidden: !tab.hidden })}
          title={tab.hidden ? t('Show tab') : t('Hide tab')}
        >
          {tab.hidden ? (
            <EyeOffIcon className="size-4" />
          ) : (
            <EyeIcon className="size-4" />
          )}
        </Button>

        {isCustom && (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 size-7 text-muted-foreground"
            onClick={() => setExpanded((prev) => !prev)}
            title={t('Connectors & sections')}
          >
            <ChevronDownIcon
              className={cn('size-4 transition-transform', {
                'rotate-180': expanded,
              })}
            />
          </Button>
        )}
      </div>

      {isCustom && expanded && (
        <div className="flex flex-col divide-y border-t">
          <ConnectorsPickerRow
            label={t('Connectors')}
            hint={t('Shown at the top of the tab')}
            connectors={connectors}
            selectedConnectorNames={tab.connectorNames ?? []}
            onChange={(connectorNames) => onChange({ connectorNames })}
          />

          <div className="flex flex-col gap-2 p-3">
            <span className="text-sm font-medium">{t('Sections')}</span>
            {sections.map((section) => (
              <div
                key={section.id}
                className="flex items-center gap-1.5 rounded-md border bg-background pl-2 pr-1 py-1"
              >
                <Input
                  value={section.title}
                  placeholder={t('Section name')}
                  onChange={(e) =>
                    updateSection(section.id, { title: e.target.value })
                  }
                  className={cn(borderlessInputClass, 'h-7 flex-1 text-sm')}
                />
                <ConnectorPickerButton
                  connectors={connectors}
                  selectedConnectorNames={section.connectorNames}
                  onChange={(connectorNames) =>
                    updateSection(section.id, { connectorNames })
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 size-7 text-muted-foreground hover:text-destructive"
                  onClick={() => removeSection(section.id)}
                  title={t('Delete section')}
                >
                  <XIcon className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="self-start text-muted-foreground"
              onClick={addSection}
            >
              <PlusIcon className="size-4 mr-2" />
              {t('Add section')}
            </Button>
          </div>

          <div className="flex justify-end p-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={onRemove}
            >
              <TrashIcon className="size-4 mr-2" />
              {t('Delete tab')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

const ConnectorsPickerRow = ({
  label,
  hint,
  connectors,
  selectedConnectorNames,
  onChange,
}: {
  label: string;
  hint: string;
  connectors: ConnectorMetadataModelSummary[];
  selectedConnectorNames: string[];
  onChange: (connectorNames: string[]) => void;
}) => {
  return (
    <div className="flex items-center justify-between gap-2 p-3">
      <div className="flex flex-col">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      <ConnectorPickerButton
        connectors={connectors}
        selectedConnectorNames={selectedConnectorNames}
        onChange={onChange}
      />
    </div>
  );
};

const TabIconPicker = ({
  value,
  iconNode,
  onChange,
}: {
  value: string | undefined;
  iconNode: ReactNode;
  onChange: (icon: string) => void;
}) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 size-8 text-foreground hover:bg-muted"
        >
          {iconNode}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2">
        <div className="grid grid-cols-6 gap-1 max-h-[260px] overflow-y-auto overflow-x-hidden">
          {CONNECTOR_SELECTOR_TAB_ICON_OPTIONS.map(({ key, Icon }) => (
            <Button
              key={key}
              variant="ghost"
              size="icon"
              className={cn('size-9', {
                'bg-accent text-primary': value === key,
              })}
              onClick={() => onChange(key)}
            >
              <Icon className="size-4" />
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const ConnectorPickerButton = ({
  connectors,
  selectedConnectorNames,
  onChange,
}: {
  connectors: ConnectorMetadataModelSummary[];
  selectedConnectorNames: string[];
  onChange: (connectorNames: string[]) => void;
}) => {
  const connectorsByName = useMemo(
    () => new Map(connectors.map((connector) => [connector.name, connector])),
    [connectors],
  );
  const selectedConnectors = selectedConnectorNames
    .map((name) => connectorsByName.get(name))
    .filter(
      (connector): connector is ConnectorMetadataModelSummary => !!connector,
    );

  const toggleConnector = (name: string) =>
    onChange(
      selectedConnectorNames.includes(name)
        ? selectedConnectorNames.filter((candidate) => candidate !== name)
        : [...selectedConnectorNames, name],
    );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 whitespace-nowrap font-normal"
        >
          {t('{count} connectors', { count: selectedConnectorNames.length })}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        {selectedConnectors.length > 0 && (
          <div className="border-b p-2">
            <Sortable
              value={selectedConnectors.map((connector) => ({
                id: connector.name,
              }))}
              onValueChange={(items) => onChange(items.map((item) => item.id))}
            >
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {selectedConnectors.map((connector) => (
                  <SortableItem
                    key={connector.name}
                    value={connector.name}
                    asChild
                  >
                    <div className="flex items-center gap-2 rounded-sm px-1 py-0.5">
                      <SortableDragHandle
                        variant="ghost"
                        size="icon"
                        className="shrink-0 size-6 text-muted-foreground/60"
                      >
                        <GripVerticalIcon className="size-3.5" />
                      </SortableDragHandle>
                      <ConnectorIcon
                        logoUrl={connector.logoUrl}
                        displayName={connector.displayName}
                        showTooltip={false}
                        size="sm"
                      />
                      <span className="grow truncate text-sm">
                        {connector.displayName}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 size-6"
                        onClick={() => toggleConnector(connector.name)}
                      >
                        <XIcon className="size-3.5" />
                      </Button>
                    </div>
                  </SortableItem>
                ))}
              </div>
            </Sortable>
          </div>
        )}
        <Command>
          <CommandInput placeholder={t('Search connectors')} />
          <CommandList>
            <CommandEmpty>{t('No connectors found')}</CommandEmpty>
            <CommandGroup>
              {connectors.map((connector) => {
                const isSelected = selectedConnectorNames.includes(
                  connector.name,
                );
                return (
                  <CommandItem
                    key={connector.name}
                    value={connector.displayName}
                    onSelect={() => toggleConnector(connector.name)}
                    className="flex items-center gap-2"
                  >
                    <ConnectorIcon
                      logoUrl={connector.logoUrl}
                      displayName={connector.displayName}
                      showTooltip={false}
                      size="sm"
                    />
                    <span className="grow truncate">
                      {connector.displayName}
                    </span>
                    {isSelected && (
                      <CheckIcon className="size-4 text-primary" />
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
