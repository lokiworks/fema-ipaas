import {
  WorkflowActionType,
  WorkflowVersion,
  workflowCompiler,
  workflowStructureUtil,
} from '@fema-ipaas/shared';

function listCandidates({
  workflowVersion,
  stepName,
}: {
  workflowVersion: WorkflowVersion;
  stepName: string;
}): string[] {
  const plan = workflowCompiler.compile({
    ...workflowVersion,
    graph: { ...workflowVersion.graph, joinEdges: [] },
  });
  const parents = buildParents({ nodes: plan.nodes });
  const currentLineage = lineageOf({ parents, id: stepName });
  if (currentLineage.length === 0) {
    return [];
  }
  return Object.values(plan.nodes)
    .filter(
      (node) =>
        node.id !== stepName &&
        workflowStructureUtil.isAction(node.step.type) &&
        isParallelSibling({
          nodes: plan.nodes,
          currentLineage,
          candidateLineage: lineageOf({ parents, id: node.id }),
        }),
    )
    .map((node) => node.id);
}

function buildParents({
  nodes,
}: {
  nodes: Nodes;
}): Record<string, LineageEdge> {
  return Object.values(nodes).reduce<Record<string, LineageEdge>>(
    (acc, node) => {
      const nextEdges = node.next.map((id): [string, LineageEdge] => [
        id,
        { parent: node.id, slot: NEXT_SLOT },
      ]);
      const childEdges = Object.entries(node.children).flatMap(([slot, ids]) =>
        ids.map((id): [string, LineageEdge] => [id, { parent: node.id, slot }]),
      );
      return {
        ...acc,
        ...Object.fromEntries([...nextEdges, ...childEdges]),
      };
    },
    {},
  );
}

function lineageOf({
  parents,
  id,
}: {
  parents: Record<string, LineageEdge>;
  id: string;
}): LineageStep[] {
  const edge = parents[id];
  if (edge === undefined) {
    return [{ id, slot: NEXT_SLOT }];
  }
  return [...lineageOf({ parents, id: edge.parent }), { id, slot: edge.slot }];
}

function isParallelSibling({
  nodes,
  currentLineage,
  candidateLineage,
}: {
  nodes: Nodes;
  currentLineage: LineageStep[];
  candidateLineage: LineageStep[];
}): boolean {
  const divergence = firstDivergence({ currentLineage, candidateLineage });
  if (divergence === undefined || divergence === 0) {
    return false;
  }
  const container = nodes[currentLineage[divergence - 1].id];
  const currentSlot = currentLineage[divergence]?.slot;
  const candidateSlot = candidateLineage[divergence]?.slot;
  if (
    container === undefined ||
    currentSlot === undefined ||
    candidateSlot === undefined ||
    container.step.type !== WorkflowActionType.PARALLEL
  ) {
    return false;
  }
  return (
    currentSlot !== candidateSlot &&
    currentSlot.startsWith(BRANCH_SLOT_PREFIX) &&
    candidateSlot.startsWith(BRANCH_SLOT_PREFIX) &&
    candidateLineage
      .slice(divergence + 1)
      .every((step) => step.slot === NEXT_SLOT)
  );
}

function firstDivergence({
  currentLineage,
  candidateLineage,
}: {
  currentLineage: LineageStep[];
  candidateLineage: LineageStep[];
}): number | undefined {
  const length = Math.min(currentLineage.length, candidateLineage.length);
  const index = Array.from({ length }, (_, position) => position).find(
    (position) => currentLineage[position].id !== candidateLineage[position].id,
  );
  return index;
}

const NEXT_SLOT = 'next';
const BRANCH_SLOT_PREFIX = 'branch_';

export const joinEdgeCandidates = { listCandidates };

type Nodes = ReturnType<typeof workflowCompiler.compile>['nodes'];

type LineageEdge = { parent: string; slot: string };

type LineageStep = { id: string; slot: string };
