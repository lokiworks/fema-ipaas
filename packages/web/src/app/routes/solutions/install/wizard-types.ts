export type WizardDraft = {
  projectId: string;
  connections: Record<string, string>;
  config: Record<string, string>;
  acknowledged: string[];
};
