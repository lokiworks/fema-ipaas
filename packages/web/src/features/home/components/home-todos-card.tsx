import { HomeTodo, HomeTodoType } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Bot, Rocket } from 'lucide-react';
import { Link } from 'react-router-dom';

import { formatUtils } from '@/lib/format-utils';

import { SideCard, SideRow } from './side-card';

export function HomeTodosCard({
  todos,
  total,
}: {
  todos: HomeTodo[];
  total: number;
}) {
  const remaining = Math.max(0, total - todos.length);
  const releaseProject = todos.find(
    (todo) => todo.type === HomeTodoType.RELEASE,
  )?.projectId;
  const approvalProject = todos.find(
    (todo) => todo.type === HomeTodoType.AGENT_APPROVAL,
  )?.projectId;
  return (
    <SideCard
      title={t('Waiting for me')}
      description={
        total > 0
          ? t('homeTodoCount', { count: total })
          : t('Nothing waiting for your approval or confirmation')
      }
    >
      {todos.length === 0 ? (
        <span className="text-xs text-muted-foreground">
          {t(
            'Release approvals and agent confirmations assigned to you show up here.',
          )}
        </span>
      ) : (
        <div className="flex flex-col gap-0.5">
          {todos.map((todo) => (
            <TodoRow key={`${todo.type}-${todo.id}`} todo={todo} />
          ))}
          {remaining > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 px-2 pt-1 text-xs text-muted-foreground">
              <span>{t('{count} more', { count: remaining })}</span>
              {releaseProject && (
                <Link
                  to={`/projects/${releaseProject}/releases`}
                  className="text-primary hover:underline"
                >
                  {t('Release approvals')}
                </Link>
              )}
              {approvalProject && (
                <Link
                  to={`/projects/${approvalProject}/agent-approvals`}
                  className="text-primary hover:underline"
                >
                  {t('Agent confirmations')}
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </SideCard>
  );
}

function TodoRow({ todo }: { todo: HomeTodo }) {
  const when = formatUtils.formatDate(new Date(todo.created));
  if (todo.type === HomeTodoType.RELEASE) {
    return (
      <SideRow
        icon={Rocket}
        iconClassName="text-primary"
        title={t('Promote "{name}" to production', {
          name: todo.workflowDisplayName,
        })}
        subtitle={
          todo.requesterName
            ? t('Release approval · requested by {name} · {when}', {
                name: todo.requesterName,
                when,
              })
            : t('Release approval · {when}', { when })
        }
        to={`/projects/${todo.projectId}/releases/${todo.id}`}
      />
    );
  }
  return (
    <SideRow
      icon={Bot}
      iconClassName="text-primary"
      title={
        todo.subject
          ? `${todo.workflowDisplayName}: ${todo.subject}`
          : todo.workflowDisplayName
      }
      subtitle={t('Agent waiting for confirmation · {when}', { when })}
      to={
        todo.executionId
          ? `/projects/${todo.projectId}/runs/${todo.executionId}`
          : `/projects/${todo.projectId}/agent-approvals`
      }
    />
  );
}
