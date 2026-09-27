import { BlueprintInputProblem } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { blueprintInputProblemMessages } from '@/features/connector-blueprints/components/inputs/blueprint-input-problem-messages';

describe('blueprintInputProblemMessages', () => {
  it('describes each problem code with a distinct message', () => {
    const messages = Object.values(BlueprintInputProblem).map((problem) =>
      blueprintInputProblemMessages.of(problem),
    );
    expect(new Set(messages).size).toEqual(messages.length);
    expect(messages.every((message) => message.length > 0)).toBe(true);
  });

  it('lists messages for every problem in order', () => {
    const problems = [BlueprintInputProblem.KEY, BlueprintInputProblem.OPTIONS];
    expect(blueprintInputProblemMessages.listOf(problems)).toEqual([
      blueprintInputProblemMessages.of(BlueprintInputProblem.KEY),
      blueprintInputProblemMessages.of(BlueprintInputProblem.OPTIONS),
    ]);
  });
});
