export const autoMapping = {
  flattenSources,
  suggestByName,
  merge,
  sourceTemplate,
};

function flattenSources({
  sampleData,
}: {
  sampleData: Record<string, unknown>;
}): MappingSource[] {
  return Object.entries(sampleData)
    .flatMap(([stepName, value]) => walk({ value, path: stepName, depth: 0 }))
    .slice(0, MAX_SOURCES);
}

function suggestByName({
  targets,
  sources,
}: {
  targets: string[];
  sources: MappingSource[];
}): MappingSuggestion[] {
  return targets.flatMap((target) => {
    const scored = sources
      .map((source) => ({
        target,
        sourcePath: source.path,
        confidence: nameScore({ target, key: lastSegment(source.path) }),
        depth: source.path.split('.').length,
      }))
      .filter((candidate) => candidate.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence || a.depth - b.depth);
    const best = scored[0];
    return best
      ? [
          {
            target: best.target,
            sourcePath: best.sourcePath,
            confidence: best.confidence,
          },
        ]
      : [];
  });
}

function merge({
  byName,
  byModel,
}: {
  byName: MappingSuggestion[];
  byModel: MappingSuggestion[];
}): MappingSuggestion[] {
  const targets = [
    ...new Set([...byName, ...byModel].map((item) => item.target)),
  ];
  return targets.flatMap((target) => {
    const candidates = [...byName, ...byModel].filter(
      (item) => item.target === target,
    );
    const best = candidates.reduce<MappingSuggestion | null>(
      (acc, item) =>
        acc === null || item.confidence > acc.confidence ? item : acc,
      null,
    );
    return best ? [best] : [];
  });
}

function sourceTemplate(path: string): string {
  return `{{${path}}}`;
}

function walk({
  value,
  path,
  depth,
}: {
  value: unknown;
  path: string;
  depth: number;
}): MappingSource[] {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    depth < MAX_DEPTH
  ) {
    return Object.entries(value).flatMap(([key, child]) =>
      walk({ value: child, path: `${path}.${key}`, depth: depth + 1 }),
    );
  }
  return [{ path, sample: sampleText(value) }];
}

function sampleText(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
  return text.length > MAX_SAMPLE ? `${text.slice(0, MAX_SAMPLE)}…` : text;
}

function lastSegment(path: string): string {
  const parts = path.split('.');
  return parts[parts.length - 1] ?? path;
}

function nameScore({ target, key }: { target: string; key: string }): number {
  const a = normalize(target);
  const b = normalize(key);
  if (a.length === 0 || b.length === 0) {
    return 0;
  }
  if (a === b) {
    return EXACT;
  }
  if (SYNONYMS.some((group) => group.includes(a) && group.includes(b))) {
    return SYNONYM;
  }
  const similar =
    (Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a))) ||
    editDistance({ a, b }) <= 2;
  return similar ? SIMILAR : 0;
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9一-鿿]/g, '');
}

function editDistance({ a, b }: { a: string; b: string }): number {
  const row = Array.from({ length: b.length + 1 }, (_unused, index) => index);
  const final = [...a].reduce((previous, charA, i) => {
    return [...b].reduce(
      (current, charB, j) => [
        ...current,
        Math.min(
          previous[j + 1] + 1,
          current[j] + 1,
          previous[j] + (charA === charB ? 0 : 1),
        ),
      ],
      [i + 1],
    );
  }, row);
  return final[b.length];
}

const EXACT = 0.95;
const SYNONYM = 0.88;
const SIMILAR = 0.55;
const MAX_SOURCES = 300;
const MAX_DEPTH = 6;
const MAX_SAMPLE = 120;
const SYNONYMS: string[][] = [
  ['email', 'mail', 'emailaddress', '邮箱', '电子邮箱'],
  [
    'phone',
    'mobile',
    'tel',
    'telephone',
    'cellphone',
    '手机',
    '手机号',
    '电话',
  ],
  ['name', 'fullname', 'username', 'displayname', '姓名', '名称'],
  ['department', 'dept', 'deptname', 'departmentname', '部门'],
  ['employeeid', 'employeeno', 'staffid', 'jobnumber', 'empno', '工号'],
  ['title', 'position', 'jobtitle', '职位', '岗位'],
  ['amount', 'total', 'totalamount', 'price', '金额'],
  ['quantity', 'qty', 'count', '数量'],
  ['date', 'day', '日期'],
  ['entrydate', 'hiredate', 'joindate', 'onboarddate', '入职日期'],
  ['code', 'no', 'number', '编码', '编号'],
  ['remark', 'remarks', 'note', 'notes', 'comment', 'memo', '备注'],
];

export const AUTO_MAPPING_DEFAULT_THRESHOLD = 0.8;

export type MappingSource = {
  path: string;
  sample: string;
};

export type MappingSuggestion = {
  target: string;
  sourcePath: string;
  confidence: number;
};
