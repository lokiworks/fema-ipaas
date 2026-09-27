import { t } from 'i18next';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { BrowserStorage } from '@/lib/browser-storage';

import { systemHooks } from '../hooks/system-hooks';

import { CheckRow } from './check-row';

export function SetupChecklistCard() {
  const { data } = systemHooks.useSetupChecklist();
  const [backupDone, setBackupDone] = useState(readBackupDone);
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
      done: backupDone,
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
                  {item.id === 'backup' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setBackupDone(markBackupDone())}
                    >
                      {t('Mark as done')}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" asChild>
                    <Link to={item.to}>{t('Open')}</Link>
                  </Button>
                </div>
              )
            }
          >
            {item.id === 'smtp' && !item.done
              ? t(
                  'Without email, invitations and email alerts are off; admins reset passwords.',
                )
              : undefined}
          </CheckRow>
        ))}
      </CardContent>
    </Card>
  );
}

function readBackupDone(): boolean {
  try {
    return BrowserStorage.getInstance().getItem(BACKUP_DONE_KEY) === 'true';
  } catch {
    return false;
  }
}

function markBackupDone(): boolean {
  try {
    BrowserStorage.getInstance().setItem(BACKUP_DONE_KEY, 'true');
  } catch {
    return true;
  }
  return true;
}

const BACKUP_DONE_KEY = 'fema.setup.backupScheduled';
