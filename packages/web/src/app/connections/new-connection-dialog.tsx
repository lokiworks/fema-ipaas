import { ConnectorMetadataModelSummary } from '@fema-ipaas/connector-sdk';
import { isNil } from '@fema-ipaas/core-utils';
import { ConnectionWithoutSensitiveData } from '@fema-ipaas/shared';
import { t } from 'i18next';
import React, { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { connectorsHooks } from '@/features/connectors';

import { CreateOrEditConnectionDialog } from './create-edit-connection-dialog';

type NewConnectionDialogProps = {
  onConnectionCreated: (connection: ConnectionWithoutSensitiveData) => void;
  children: React.ReactNode;
  isGlobalConnection: boolean;
};

const NewConnectionDialog = React.memo(
  ({
    onConnectionCreated,
    children,
    isGlobalConnection,
  }: NewConnectionDialogProps) => {
    const [dialogTypesOpen, setDialogTypesOpen] = useState(false);
    const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
    const [selectedConnector, setSelectedConnector] = useState<
      ConnectorMetadataModelSummary | undefined
    >(undefined);
    const { connectors, isLoading } = connectorsHooks.useConnectors({});
    const [searchTerm, setSearchTerm] = useState('');

    const filteredConnectors = connectors?.filter((connector) => {
      return (
        !isNil(connector.auth) &&
        connector.displayName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });

    const clickConnector = (name: string) => {
      setDialogTypesOpen(false);
      setSelectedConnector(
        connectors?.find((connector) => connector.name === name),
      );
      setConnectionDialogOpen(true);
    };

    return (
      <>
        {selectedConnector && (
          <CreateOrEditConnectionDialog
            reconnectConnection={null}
            connector={selectedConnector}
            open={connectionDialogOpen}
            isGlobalConnection={isGlobalConnection}
            key={`CreateOrEditConnectionDialog-open-${connectionDialogOpen}`}
            setOpen={(open, connection) => {
              setConnectionDialogOpen(open);
              if (connection) {
                onConnectionCreated(connection);
              }
            }}
          ></CreateOrEditConnectionDialog>
        )}
        <Dialog
          open={dialogTypesOpen}
          onOpenChange={(open) => {
            setDialogTypesOpen(open);
            setSearchTerm('');
          }}
        >
          <DialogTrigger asChild>{children}</DialogTrigger>
          <DialogContent className="w-[calc(100vw-2rem)] sm:min-w-[700px] sm:max-w-[700px] max-h-[680px] flex flex-col">
            <DialogHeader>
              <DialogTitle>{t('New Connection')}</DialogTitle>
              <DialogDescription>
                {t('Pick the app you want to connect to.')}
              </DialogDescription>
            </DialogHeader>
            <div className="mb-4">
              <Input
                placeholder={t('Search')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <ScrollArea className="min-h-0 grow overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 pb-1 sm:grid-cols-4">
                {!isLoading &&
                  filteredConnectors &&
                  filteredConnectors.length === 0 && (
                    <div className="col-span-full text-sm text-muted-foreground">
                      {t('No connectors found')}
                    </div>
                  )}
                {!isLoading &&
                  filteredConnectors &&
                  filteredConnectors.map((connector) => (
                    <button
                      type="button"
                      key={connector.name}
                      onClick={() => clickConnector(connector.name)}
                      className="flex h-[108px] w-full flex-col items-center justify-center gap-2 rounded-lg border p-2 hover:bg-accent hover:text-accent-foreground"
                    >
                      <img
                        className="size-9"
                        src={connector.logoUrl}
                        alt=""
                      ></img>
                      <span className="line-clamp-2 text-center text-sm">
                        {connector.displayName}
                      </span>
                    </button>
                  ))}
              </div>
            </ScrollArea>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {t('Cancel')}
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  },
);

NewConnectionDialog.displayName = 'NewConnectionDialog';
export { NewConnectionDialog };
