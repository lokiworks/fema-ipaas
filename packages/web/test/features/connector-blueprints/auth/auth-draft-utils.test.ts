import {
  BlueprintAuthFlow,
  BlueprintAuthProblem,
  BlueprintAuthType,
  blueprintFactory,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { authDraftUtils } from '@/features/connector-blueprints/components/auth/auth-draft-utils';

describe('authDraftUtils', () => {
  it('same() compares by deep value, not by reference', () => {
    const auth = blueprintFactory.auth({
      type: BlueprintAuthType.API_KEY,
      name: 'Test',
      description: '',
    });
    expect(authDraftUtils.same({ left: auth, right: { ...auth } })).toBe(true);
    expect(
      authDraftUtils.same({ left: auth, right: { ...auth, name: 'Other' } }),
    ).toBe(false);
  });

  it('flowStepOf/withFlowStep read and update the right flow step', () => {
    const auth = blueprintFactory.auth({
      type: BlueprintAuthType.CLIENT_CREDENTIALS,
      name: 'Test',
      description: '',
    });
    expect(
      authDraftUtils.flowStepOf({ auth, flow: BlueprintAuthFlow.TOKEN }),
    ).toBe(auth.tokenFlow);
    const next = authDraftUtils.withFlowStep({
      auth,
      flow: BlueprintAuthFlow.TOKEN,
      patch: { url: '/custom/token' },
    });
    expect(next.tokenFlow.url).toBe('/custom/token');
    expect(next.userFlow).toBe(auth.userFlow);
  });

  it('flowStepError requires a url and rejects invalid JSON config', () => {
    const auth = blueprintFactory.auth({
      type: BlueprintAuthType.CLIENT_CREDENTIALS,
      name: 'Test',
      description: '',
    });
    expect(
      authDraftUtils.flowStepError({
        required: true,
        enabled: true,
        step: { ...auth.tokenFlow, url: '' },
      }),
    ).toBe('URL_REQUIRED');
    expect(
      authDraftUtils.flowStepError({
        required: true,
        enabled: true,
        step: { ...auth.tokenFlow, url: 'not-a-url' },
      }),
    ).toBe('URL_INVALID');
    expect(
      authDraftUtils.flowStepError({
        required: true,
        enabled: true,
        step: { ...auth.tokenFlow, config: '{invalid' },
      }),
    ).toBe('CONFIG_INVALID');
    expect(
      authDraftUtils.flowStepError({
        required: true,
        enabled: true,
        step: auth.tokenFlow,
      }),
    ).toBeNull();
  });

  it('flowStepError skips validation for a disabled optional flow', () => {
    const auth = blueprintFactory.auth({
      type: BlueprintAuthType.CLIENT_CREDENTIALS,
      name: 'Test',
      description: '',
    });
    expect(
      authDraftUtils.flowStepError({
        required: false,
        enabled: false,
        step: { ...auth.userFlow, url: '' },
      }),
    ).toBeNull();
  });

  it('stepIsValid maps auth problems to the right wizard step', () => {
    expect(
      authDraftUtils.stepIsValid({
        step: 0,
        problems: [BlueprintAuthProblem.NAME],
      }),
    ).toBe(false);
    expect(
      authDraftUtils.stepIsValid({
        step: 1,
        problems: [BlueprintAuthProblem.CREDENTIAL],
      }),
    ).toBe(false);
    expect(
      authDraftUtils.stepIsValid({
        step: 2,
        problems: [BlueprintAuthProblem.PLUGIN],
      }),
    ).toBe(false);
    expect(authDraftUtils.stepIsValid({ step: 0, problems: [] })).toBe(true);
    expect(
      authDraftUtils.stepIsValid({
        step: 3,
        problems: [BlueprintAuthProblem.NAME],
      }),
    ).toBe(true);
  });

  it('publishChecklist combines problems, dirty state and test results', () => {
    const checklist = authDraftUtils.publishChecklist({
      problems: [BlueprintAuthProblem.FIELDS],
      dirty: true,
      flowPassed: true,
      apiPassed: false,
    });
    expect(checklist).toEqual({
      basicInfo: true,
      fieldsValid: false,
      flowConfigured: true,
      saved: false,
      flowTestPassed: true,
      apiTestPassed: false,
    });
  });
});
