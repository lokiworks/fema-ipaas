import { isNil } from '@fema-ipaas/core-utils';
import { Template } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { LogIn, Plus } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  projectDirectoryHooks,
  projectDirectoryUtils,
} from '@/features/projects/api/project-directory-api';
import { authenticationSession } from '@/lib/authentication-session';
import { FROM_QUERY_PARAM } from '@/lib/navigation-utils';

import { templatesMutations } from '../hooks/templates-hook';

import { TemplateTargetProjectDialog } from './template-target-project-dialog';

export function TemplateUseAction({
  template,
  projectId,
  onDone,
}: {
  template: Template;
  projectId?: string | null;
  onDone?: () => void;
}) {
  const isAuthenticated = !isNil(authenticationSession.getToken());
  if (!isAuthenticated) {
    return <SignInToUseButton />;
  }
  return (
    <AuthenticatedUseButton
      template={template}
      projectId={projectId ?? null}
      onDone={onDone}
    />
  );
}

function SignInToUseButton() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <Button
      type="button"
      onClick={() =>
        navigate(
          `/sign-in?${FROM_QUERY_PARAM}=${encodeURIComponent(
            `${location.pathname}${location.search}`,
          )}`,
        )
      }
    >
      <LogIn className="size-4" />
      {t('Sign in to use this template')}
    </Button>
  );
}

function AuthenticatedUseButton({
  template,
  projectId,
  onDone,
}: {
  template: Template;
  projectId: string | null;
  onDone?: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const {
    data: directory,
    isLoading,
    isError,
  } = projectDirectoryHooks.useDirectory();
  const { mutate, isPending } = templatesMutations.useUseTemplate({
    onSuccess: () => {
      setPicking(false);
      onDone?.();
    },
  });
  const preset = directory?.find((project) => project.id === projectId);

  const handleUse = () => {
    if (!isNil(preset) && projectDirectoryUtils.canCreateWorkflow(preset)) {
      mutate({ template, projectId: preset.id });
      return;
    }
    setPicking(true);
  };

  return (
    <>
      <Button
        type="button"
        onClick={handleUse}
        loading={isPending || (isLoading && !isNil(projectId))}
      >
        <Plus className="size-4" />
        {t('Use this template')}
      </Button>
      <TemplateTargetProjectDialog
        open={picking}
        onOpenChange={setPicking}
        template={template}
        directory={directory}
        isLoading={isLoading}
        isError={isError}
        defaultProjectId={projectId ?? authenticationSession.getProjectId()}
        onConfirm={(targetProjectId) =>
          mutate({ template, projectId: targetProjectId })
        }
        isPending={isPending}
      />
    </>
  );
}
