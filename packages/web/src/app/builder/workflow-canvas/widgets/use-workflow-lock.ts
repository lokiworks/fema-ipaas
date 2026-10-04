import { isNil, Permission } from '@fema-ipaas/core-utils';
import { DefaultProjectRole } from '@fema-ipaas/shared';
import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuthorization, useProjectRole } from '@/hooks/authorization-hooks';
import { useResourceLock } from '@/hooks/use-resource-lock';

import { useBuilderStateContext } from '../../builder-hooks';
import { workflowCanvasHooks } from '../hooks';

function useWorkflowLock() {
  const [
    readonly,
    workflowId,
    setReadOnly,
    setEditLockHolder,
    setEditLockActions,
    saving,
  ] = useBuilderStateContext((state) => [
    state.readonly,
    state.workflow.id,
    state.setReadOnly,
    state.setEditLockHolder,
    state.setEditLockActions,
    state.saving,
  ]);
  const run = useBuilderStateContext((state) => state.run);
  const readonlySetByLock = useRef(false);
  const lastActivityAt = useRef(Date.now());
  const navigate = useNavigate();
  const { switchToDraft } = workflowCanvasHooks.useSwitchToDraft();
  const { data: projectRole } = useProjectRole();
  const { checkAccess } = useAuthorization();

  useEffect(() => {
    if (saving) {
      lastActivityAt.current = Date.now();
    }
  }, [saving]);

  const onTakeOver = useCallback(() => {
    if (!isNil(run)) {
      navigate(`/workflows/${workflowId}`);
    } else {
      switchToDraft();
    }
  }, [run, navigate, workflowId, switchToDraft]);

  const isActive = useCallback(
    () => Date.now() - lastActivityAt.current < ACTIVITY_WINDOW_MS,
    [],
  );

  const { lockedBy, takeOver, requestEdit } = useResourceLock({
    resourceId: workflowId,
    onTakeOver,
    isActive,
    enabled: checkAccess(Permission.WRITE_WORKFLOW),
  });

  useEffect(() => {
    setEditLockHolder(lockedBy);
  }, [lockedBy, setEditLockHolder]);

  const canTakeOver = projectRole?.role === DefaultProjectRole.ADMIN;
  useEffect(() => {
    setEditLockActions({ takeOver, requestEdit, canTakeOver });
    return () => setEditLockActions(null);
  }, [takeOver, requestEdit, canTakeOver, setEditLockActions]);

  useEffect(() => {
    if (lockedBy && !readonly) {
      readonlySetByLock.current = true;
      setReadOnly(true);
    }
    if (!lockedBy && readonlySetByLock.current) {
      readonlySetByLock.current = false;
      setReadOnly(false);
    }
  }, [lockedBy, readonly, setReadOnly]);

  return {
    lockedBy,
    takeOver,
    requestEdit,
    canTakeOver,
  };
}

const ACTIVITY_WINDOW_MS = 35_000;

export { useWorkflowLock };
