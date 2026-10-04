import { t } from 'i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { systemHooks } from '../hooks/system-hooks';

import { CheckRow } from './check-row';

export function SetupChecklistCard() {
  const { data } = systemHooks.useSetupChecklist();
  if (!data) {
    return null;
  }
  const items = [
    {
      id: 'members',
      done: data.membersInvited,
      title: t('Invite members'),
      to: '/tenant/users',
    },
    {
      id: 'login',
      done: data.loginMethodsConfigured,
      title: t('Set up sign-in methods'),
      to: '/tenant/security/authentication',
    },
    {
      id: 'backup',
      done: data.backupsWorking,
      title: t('Schedule backups'),
      to: '/tenant/infra/backup',
    },
    {
      id: 'alerts',
      done: data.alertChannelsConfigured,
      title: t('Add an alert channel'),
      to: '/tenant/alerts',
    },
    {
      id: 'smtp',
      done: data.smtpEnabled,
      title: t('Configure email (SMTP)'),
      to: '/tenant/infra/system',
    },
  ];
  const remaining = items.filter((item) => !item.done).length;
  if (remaining === 0) {
    return null;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Platform setup')}</CardTitle>
        <CardDescription>
          {t('{count} of {total} done', {
            count: items.length - remaining,
            total: items.length,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {items.map((item) => (
          <CheckRow
            key={item.id}
            level={item.done ? 'ok' : 'info'}
            title={item.title}
            action={
              item.done ? undefined : (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <Link to={item.to}>{t('Open')}</Link>
                  </Button>
                </div>
              )
            }
          >
            {checklistNote({ id: item.id, done: item.done })}
          </CheckRow>
        ))}
      </CardContent>
    </Card>
  );
}

function checklistNote({
  id,
  done,
}: {
  id: string;
  done: boolean;
}): string | undefined {
  if (done) {
    return undefined;
  }
  switch (id) {
    case 'smtp':
      return t(
        'Without email, invitations and email alerts are off; admins reset passwords.',
      );
    case 'backup':
      return t(
        'Done once the schedule is on and a backup has succeeded. Open Backup and restore to run one now.',
      );
    default:
      return undefined;
  }
}
