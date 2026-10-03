import { workflowStructureUtil } from '@fema-ipaas/shared';

function shouldShow({
  section,
  stepType,
}: {
  section: 'action' | 'input' | 'error';
  stepType: Parameters<typeof workflowStructureUtil.isAction>[0];
}): boolean {
  return section === 'action' && workflowStructureUtil.isAction(stepType);
}

export const joinEdgesVisibility = { shouldShow };
