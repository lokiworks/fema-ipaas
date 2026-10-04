import { BackupEngineProblem, BackupOverview } from '@fema-ipaas/shared';
import { t } from 'i18next';

import { CopyToClipboardInput } from '@/components/custom/clipboard/copy-to-clipboard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { backupText } from '../utils/backup-text';

export function BackupNotices({ overview }: { overview: BackupOverview }) {
  const { engine } = overview;
  return (
    <>
      {!engine.available && engine.problem && (
        <Alert variant="warning">
          <AlertTitle>
            {backupText.engineProblemTitle({ problem: engine.problem })}
          </AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <EngineProblemText overview={overview} />
            <CopyToClipboardInput
              useInput={false}
              textToCopy={installCommands({ overview })}
            />
            <span>
              {t(
                'Until then, back up from the command line with the commands at the bottom of this page. Nothing else is affected.',
              )}
            </span>
          </AlertDescription>
        </Alert>
      )}
      {overview.directoryMayBeEphemeral && (
        <Alert variant="warning">
          <AlertTitle>{t('Backups may be lost with the container')}</AlertTitle>
          <AlertDescription>
            {t(
              '{directory} is not on a mounted volume. When the container is recreated, the backups in it are gone. Mount a volume at the data directory, or turn on the copy to object storage.',
              { directory: overview.directory },
            )}
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}

function EngineProblemText({ overview }: { overview: BackupOverview }) {
  const { engine } = overview;
  if (engine.problem === BackupEngineProblem.PG_DUMP_MISSING) {
    return (
      <span>
        {t(
          'The official image includes it. On another install, add the PostgreSQL client tools to the server that runs the app:',
        )}
      </span>
    );
  }
  return (
    <span>
      {t(
        'pg_dump {client} cannot dump PostgreSQL {server}. Install client tools of version {server} or newer on the server that runs the app:',
        {
          client: engine.clientVersion ?? '',
          server: engine.serverVersion ?? '',
        },
      )}
    </span>
  );
}

function installCommands({ overview }: { overview: BackupOverview }): string {
  const major = overview.engine.serverVersion?.split('.')[0] ?? '';
  const debian =
    overview.engine.problem === BackupEngineProblem.PG_DUMP_TOO_OLD && major
      ? `apt-get install postgresql-client-${major}`
      : 'apt-get install postgresql-client';
  return `# Debian / Ubuntu\n${debian}\n# macOS\nbrew install libpq && brew link --force libpq`;
}
