import { ConnectorBlueprintDetail } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { FileQuestionIcon, PackageXIcon } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/custom/empty';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { connectorBlueprintHooks } from '@/features/connector-blueprints';
import { BlueprintAuthSection } from '@/features/connector-blueprints/components/auth/auth-section';
import { BlueprintBasicSection } from '@/features/connector-blueprints/components/basic/basic-section';
import { BlueprintOperationEditor } from '@/features/connector-blueprints/components/operation/operation-editor';
import { BlueprintStatusSection } from '@/features/connector-blueprints/components/status/status-section';
import { BlueprintTriggerEditor } from '@/features/connector-blueprints/components/trigger/trigger-editor';
import { BlueprintVersionsSection } from '@/features/connector-blueprints/components/versions/versions-section';
import { BlueprintWorkspaceSidebar } from '@/features/connector-blueprints/components/workspace/workspace-sidebar';

export default function ConnectorDevelopmentDetailPage() {
  const {
    id,
    section = 'basic',
    sub,
  } = useParams<{ id: string; section: string; sub: string }>();
  const navigate = useNavigate();
  const { data: detail, isLoading } =
    connectorBlueprintHooks.useConnectorBlueprint(id ?? null);

  if (isLoading) {
    return <Skeleton className="m-4 h-96 w-full" />;
  }

  if (!detail) {
    return (
      <div className="p-4">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageXIcon />
            </EmptyMedia>
            <EmptyTitle>{t('Connector not found')}</EmptyTitle>
            <EmptyDescription>
              {t(
                'It may have been deleted, or you are not one of its developers. Ask its owner to add you.',
              )}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => navigate('/tenant/connectors/development')}>
              {t('Back to Connector Development')}
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full">
      <BlueprintWorkspaceSidebar detail={detail} section={section} sub={sub} />
      <div className="min-w-0 flex-1 overflow-auto">
        <WorkspaceMain detail={detail} section={section} sub={sub} />
      </div>
    </div>
  );
}

function WorkspaceMain({
  detail,
  section,
  sub,
}: {
  detail: ConnectorBlueprintDetail;
  section: string;
  sub: string | undefined;
}) {
  switch (section) {
    case 'basic':
      return (
        <div className="p-4">
          <BlueprintBasicSection detail={detail} />
        </div>
      );
    case 'auth':
      return (
        <div className="p-4">
          <BlueprintAuthSection detail={detail} sub={sub} />
        </div>
      );
    case 'status':
      return (
        <div className="p-4">
          <BlueprintStatusSection detail={detail} />
        </div>
      );
    case 'versions':
      return (
        <div className="p-4">
          <BlueprintVersionsSection detail={detail} />
        </div>
      );
    case 'op':
      return sub ? (
        <BlueprintOperationEditor
          key={`${detail.id}:${sub}`}
          detail={detail}
          operationKey={sub}
        />
      ) : (
        <SectionNotFound detailId={detail.id} />
      );
    case 'trigger':
      return sub ? (
        <div className="p-4">
          <BlueprintTriggerEditor
            key={`${detail.id}:${sub}`}
            detail={detail}
            triggerKey={sub}
          />
        </div>
      ) : (
        <SectionNotFound detailId={detail.id} />
      );
    default:
      return <SectionNotFound detailId={detail.id} />;
  }
}

function SectionNotFound({ detailId }: { detailId: string }) {
  const navigate = useNavigate();
  return (
    <div className="p-4">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileQuestionIcon />
          </EmptyMedia>
          <EmptyTitle>{t('Page not found')}</EmptyTitle>
          <EmptyDescription>
            {t('The link may be out of date.')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            onClick={() =>
              navigate(`/tenant/connectors/development/${detailId}/basic`)
            }
          >
            {t('Back to basic information')}
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
