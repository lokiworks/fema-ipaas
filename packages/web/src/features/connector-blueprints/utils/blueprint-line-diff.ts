export const blueprintLineDiff = {
  compute({
    before,
    after,
  }: {
    before: string;
    after: string;
  }): BlueprintLineDiff {
    const left = before.length > 0 ? before.split('\n') : [];
    const right = after.length > 0 ? after.split('\n') : [];
    const table = lcsTable({ left, right });
    return walk({ left, right, table });
  },
};

function lcsTable({
  left,
  right,
}: {
  left: string[];
  right: string[];
}): number[][] {
  const table = Array.from({ length: left.length + 1 }, () =>
    new Array<number>(right.length + 1).fill(0),
  );
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        left[i] === right[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

function walk({
  left,
  right,
  table,
}: {
  left: string[];
  right: string[];
  table: number[][];
}): BlueprintLineDiff {
  const before: BlueprintDiffLine[] = [];
  const after: BlueprintDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      before.push({ text: left[i], kind: 'same' });
      after.push({ text: right[j], kind: 'same' });
      i += 1;
      j += 1;
      continue;
    }
    if (
      j >= right.length ||
      (i < left.length && table[i + 1][j] >= table[i][j + 1])
    ) {
      before.push({ text: left[i], kind: 'removed' });
      i += 1;
      continue;
    }
    after.push({ text: right[j], kind: 'added' });
    j += 1;
  }
  return { before, after };
}

export type BlueprintDiffLineKind = 'same' | 'added' | 'removed';

export type BlueprintDiffLine = {
  text: string;
  kind: BlueprintDiffLineKind;
};

export type BlueprintLineDiff = {
  before: BlueprintDiffLine[];
  after: BlueprintDiffLine[];
};
