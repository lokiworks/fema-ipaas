import {
  DefaultProjectRole,
  Folder,
  ProjectTreeWorkflow,
  WorkflowStatus,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { workspaceUtils } from '@/features/project-workspace/lib/workspace-utils';

function folder(id: string, parentId: string | null): Folder {
  return {
    id,
    parentId,
    displayName: id,
    projectId: 'p',
    displayOrder: 0,
    externalId: id,
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
  };
}

function workflow(id: string, folderId: string | null): ProjectTreeWorkflow {
  return {
    id,
    displayName: `Workflow ${id}`,
    folderId,
    status: WorkflowStatus.DISABLED,
    published: false,
    hasUnpublishedChanges: false,
    updated: '2026-01-01T00:00:00.000Z',
    ownerId: null,
    description: null,
  };
}

const folders = [folder('a', null), folder('b', 'a'), folder('c', 'b')];
const workflows = [workflow('1', null), workflow('2', 'a'), workflow('3', 'c')];

describe('workspaceUtils.buildTreeRows', () => {
  it('renders folders first, then workflows, with depth and subtree counts', () => {
    const rows = workspaceUtils.buildTreeRows({
      folders,
      workflows,
      query: '',
      collapsed: new Set(),
    });
    expect(
      rows.map((row) =>
        row.kind === 'folder'
          ? `F:${row.folder.id}:${row.depth}:${row.count}`
          : `W:${row.workflow.id}:${row.depth}`,
      ),
    ).toEqual(['F:a:0:2', 'F:b:1:1', 'F:c:2:1', 'W:3:3', 'W:2:1', 'W:1:0']);
  });

  it('hides the content of collapsed folders', () => {
    const rows = workspaceUtils.buildTreeRows({
      folders,
      workflows,
      query: '',
      collapsed: new Set(['a']),
    });
    expect(rows.map((row) => row.kind)).toEqual(['folder', 'workflow']);
  });

  it('keeps only matching workflows and the folders that contain them', () => {
    const rows = workspaceUtils.buildTreeRows({
      folders,
      workflows,
      query: 'workflow 3',
      collapsed: new Set(['a']),
    });
    expect(
      rows.map((row) =>
        row.kind === 'folder' ? row.folder.id : row.workflow.id,
      ),
    ).toEqual(['a', 'b', 'c', '3']);
  });
});

describe('workspaceUtils.canCreateSubfolder', () => {
  it('blocks a fourth level', () => {
    expect(
      workspaceUtils.canCreateSubfolder({ folderId: 'c', folders }),
    ).toEqual({ allowed: false, reason: 'depth' });
    expect(
      workspaceUtils.canCreateSubfolder({ folderId: 'b', folders }),
    ).toEqual({ allowed: true, reason: null });
  });

  it('blocks when the project already has 100 folders', () => {
    const many = Array.from({ length: 100 }, (_, index) =>
      folder(`f${index}`, null),
    );
    expect(
      workspaceUtils.canCreateSubfolder({ folderId: null, folders: many }),
    ).toEqual({ allowed: false, reason: 'limit' });
  });
});

describe('workspaceUtils numbers', () => {
  it('computes the success rate over finished runs only', () => {
    expect(workspaceUtils.successRate({ succeeded: 9, failed: 1 })).toBe(90);
    expect(workspaceUtils.successRate({ succeeded: 0, failed: 0 })).toBeNull();
  });

  it('computes the change against the previous period', () => {
    expect(workspaceUtils.changePercent({ current: 15, previous: 10 })).toBe(
      50,
    );
    expect(
      workspaceUtils.changePercent({ current: 3, previous: 0 }),
    ).toBeNull();
  });

  it('caps badges at 99+', () => {
    expect(workspaceUtils.badgeText(5)).toBe('5');
    expect(workspaceUtils.badgeText(120)).toBe('99+');
  });
});

describe('workspaceUtils.parseWorkflowExport', () => {
  const file = {
    format: 'workflow-export',
    version: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    workflow: {
      name: 'Daily report',
      trigger: {
        name: 'trigger',
        type: 'EMPTY',
        valid: false,
        displayName: 'Select Trigger',
        lastUpdatedDate: '2026-01-01T00:00:00.000Z',
        settings: {},
      },
      schemaVersion: null,
    },
  };

  it('accepts files in the workflow-export format', () => {
    const parsed = workspaceUtils.parseWorkflowExport(JSON.stringify(file));
    expect('file' in parsed && parsed.file.workflow.name).toBe('Daily report');
  });

  it('rejects other formats and broken JSON', () => {
    expect(
      workspaceUtils.parseWorkflowExport(
        JSON.stringify({ ...file, format: 'template' }),
      ),
    ).toEqual({ error: 'invalidFormat' });
    expect(workspaceUtils.parseWorkflowExport('{')).toEqual({
      error: 'invalidFormat',
    });
  });
});

describe('workspaceUtils names', () => {
  it('suffixes duplicate names', () => {
    expect(
      workspaceUtils.uniqueName({
        base: 'Sync',
        taken: ['sync', 'Sync (2)'],
        maxLength: 100,
      }),
    ).toBe('Sync (3)');
  });

  it('makes file names safe', () => {
    expect(workspaceUtils.exportFileName('a/b:c')).toBe('a_b_c.json');
    expect(workspaceUtils.exportFileName('   ')).toBe('workflow.json');
  });

  it('only owners and editors can edit', () => {
    expect(workspaceUtils.canEditRole(DefaultProjectRole.DEVELOPER)).toBe(true);
    expect(workspaceUtils.canEditRole(DefaultProjectRole.OPERATOR)).toBe(false);
  });
});
