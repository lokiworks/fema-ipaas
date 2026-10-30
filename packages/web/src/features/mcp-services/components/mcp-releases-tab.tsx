import { McpService } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { History } from 'lucide-react';

import { FormattedDate } from '@/components/custom/formatted-date';
import { ListEmptyState } from '@/components/custom/list-empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function McpReleasesTab({
  service,
  canEdit,
}: {
  service: McpService;
  canEdit: boolean;
}) {
  if (service.releases.length === 0) {
    return (
      <ListEmptyState
        icon={History}
        title={t('No releases yet')}
        description={
          canEdit
            ? t(
                'Add tools, then click Publish at the top of the page so AI assistants can use this service.',
              )
            : t('The service owner has not published a release yet.')
        }
      />
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('Version')}</TableHead>
          <TableHead>{t('Release note')}</TableHead>
          <TableHead>{t('Published at')}</TableHead>
          <TableHead>{t('Published by')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {service.releases.map((release) => (
          <TableRow key={release.version}>
            <TableCell className="font-semibold">{release.version}</TableCell>
            <TableCell>
              {release.note || (
                <span className="text-muted-foreground">{t('No note')}</span>
              )}
            </TableCell>
            <TableCell>
              <FormattedDate
                date={new Date(release.publishedAt)}
                includeTime={true}
              />
            </TableCell>
            <TableCell>{release.publisherName ?? t('Unknown')}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export { McpReleasesTab };
