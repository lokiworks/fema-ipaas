import { WorkflowAction, WorkflowActionType } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { textMentionUtils } from '@/app/builder/connector-properties/text-input-with-mentions/text-input-utils';

describe('textMentionUtils.parseLabelFromMention — flattenNestedKeys', () => {
  it("extracts the step name from the ['output']-nested form", () => {
    const label = textMentionUtils.parseLabelFromMention(
      "{{flattenNestedKeys(step_1['output'], ['items'])}}",
      [],
      [],
    );
    // Regex matched and pulled out the clean step name (not "flattenNestedKeys(step_1").
    expect(label.displayText).toBe('Broken reference · step_1');
  });

  it('still parses the legacy (un-nested) form for backward compatibility', () => {
    const label = textMentionUtils.parseLabelFromMention(
      "{{flattenNestedKeys(step_1, ['items'])}}",
      [],
      [],
    );
    expect(label.displayText).toBe('Broken reference · step_1');
  });
});

describe('textMentionUtils.parseLabelFromMention — project variables', () => {
  it('labels a project variable mention with its display name', () => {
    const label = textMentionUtils.parseLabelFromMention(
      '{{variables.ed_threshold}}',
      [],
      [],
      new Map([['ed_threshold', 'Threshold']]),
    );
    expect(label.displayText).toBe('Variable · Threshold');
    expect(label.isVariable).toBe(true);
  });
});

const convert = (text: string) =>
  textMentionUtils.convertTextToTipTapJsonContent(text, [], []);

describe('textMentionUtils.convertTextToTipTapJsonContent', () => {
  describe('unclosed "{{" does not hang the tokenizer', () => {
    // Before the fix these inputs spun forever in tokenizeExpression and froze
    // the tab; an infinite loop now surfaces as a vitest timeout instead.
    it.each(['{{', '{{foo', 'text {{', '{{foo bar baz', '{{a}} {{b'])(
      'returns for %j',
      (input) => {
        expect(() => convert(input)).not.toThrow();
        expect(convert(input)).toBeDefined();
      },
    );

    it('keeps unclosed "{{" as literal text', () => {
      const paragraphs = convert('{{foo');
      const text = paragraphs[0].content
        .filter((node) => node.type === 'text')
        .map((node) => node.text)
        .join('');
      expect(text).toBe('{{foo');
    });
  });

  it('renders a complete "{{ ... }}" as a mention node', () => {
    const paragraphs = convert('{{step_1.field}}');
    const hasMention = paragraphs[0].content.some(
      (node) => node.type === 'mention',
    );
    expect(hasMention).toBe(true);
  });

  describe('references inside quotes keep their mention node', () => {
    it.each([
      "\"{{step_4['output']['result']}}\"",
      '"{{step_4["output"]["result"]}}"',
      "'{{step_4.result}}'",
      'fullText contains "{{step_4.result}}',
      'fema-formula-v1::{upper("{{step_1.name}}")}::fema-formula-v1',
    ])('renders a mention for %j', (input) => {
      const paragraphs = convert(input);
      const hasMention = paragraphs[0].content.some(
        (node) => node.type === 'mention',
      );
      expect(hasMention).toBe(true);
    });

    it.each([
      "\"{{step_4['output']['result']}}\"",
      '"{{step_4["output"]["result"]}}"',
      '"{{step_1.name}} upper(x)"',
      'fema-formula-v1::{upper("(CEO); still inside")}::fema-formula-v1',
      'fema-formula-v1::{upper("pre {{step_1.name}} post")}::fema-formula-v1',
      'fema-formula-v1::{upper("(a) {{step_1.name}} (b); x")}::fema-formula-v1',
      'fema-formula-v1::{concat("{{a"}}; lower(x))}::fema-formula-v1',
      'fema-formula-v1::{upper("literal {{ braces }} here")}::fema-formula-v1',
      'fema-formula-v1::{upper({{step_1["a\'b"]}}; x)}::fema-formula-v1',
      "fema-formula-v1::{upper('pre {{step_1['output']['a\\'b']}} and lower(x)')}::fema-formula-v1",
    ])('round-trips %j losslessly', (input) => {
      const back = textMentionUtils.convertTiptapJsonToText({
        type: 'doc',
        content: convert(input),
      });
      expect(back).toBe(input);
    });
  });
});

describe('textMentionUtils.parseLabelFromMention — friendly field names', () => {
  const step = {
    name: 'step_2',
    type: WorkflowActionType.CODE,
    displayName: 'Read employee',
    valid: true,
    lastUpdatedDate: '2024-01-01T00:00:00.000Z',
    settings: { sourceCode: { code: '', packageJson: '{}' }, input: {} },
  } satisfies WorkflowAction;
  const metadata = {
    type: WorkflowActionType.CODE,
    displayName: 'Code',
    logoUrl: '',
    description: '',
    stepDisplayName: 'Read employee',
    stepNumber: 2,
    outputSchema: {
      fields: [
        {
          key: 'employeeInfo',
          label: '员工信息',
          children: [
            { key: 'name', label: '姓名' },
            { key: 'mobilePhone', label: '手机号' },
          ],
        },
      ],
    },
  } satisfies Parameters<typeof textMentionUtils.parseLabelFromMention>[2][number];

  it('labels the reference with the step number and schema labels', () => {
    const label = textMentionUtils.parseLabelFromMention(
      "{{step_2['output']['employeeInfo']['name']}}",
      [step],
      [metadata],
    );
    expect(label.displayText).toBe('2.员工信息.姓名');
    expect(label.leafText).toBe('姓名');
    expect(label.fullText).toBe('2. Read employee · 员工信息 · 姓名');
  });

  it('tells two sibling fields apart by their own label', () => {
    const phone = textMentionUtils.parseLabelFromMention(
      "{{step_2['output']['employeeInfo']['mobilePhone']}}",
      [step],
      [metadata],
    );
    expect(phone.displayText).toBe('2.员工信息.手机号');
  });

  it('falls back to the raw key when the schema does not describe it', () => {
    const label = textMentionUtils.parseLabelFromMention(
      "{{step_2['output']['extra']['x']}}",
      [step],
      [metadata],
    );
    expect(label.displayText).toBe('2.extra.x');
  });
});
