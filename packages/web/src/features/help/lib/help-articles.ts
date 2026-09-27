import { t } from 'i18next';
import {
  ArrowLeftRight,
  Braces,
  Keyboard,
  Link2,
  LucideIcon,
  Rocket,
  ShieldAlert,
  Siren,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';

function list(): HelpArticle[] {
  const mod = modKey();
  return [
    {
      id: 'quickstart',
      icon: Rocket,
      title: t('Build your first workflow in 5 minutes'),
      body: [
        t(
          'Open a project you can edit, then create a workflow from the project page or the home page.',
        ),
        t(
          'Pick a trigger: a schedule, a webhook, a form, a sub-flow, or an event from an app.',
        ),
        t(
          'Click the + on a connecting line to add logic, helper, app or AI steps. App steps need a connection you can use in this project.',
        ),
        t(
          'Fill in the inputs. Type $ to insert data from earlier steps or project configuration.',
        ),
        t(
          'Click Test, provide sample trigger data, and check every step’s input, output and error.',
        ),
        t(
          'Publish when it works. Projects with test and production environments publish to test first and promote to production after verification.',
        ),
      ],
    },
    {
      id: 'references',
      icon: Braces,
      title: t('Use data from earlier steps'),
      body: [
        t(
          'Type $ in an input to open the data picker, expand a step’s output and click a field to insert it.',
        ),
        t(
          'You can only reference steps that run before the current one. Branches cannot read each other; after a branch or loop ends, later steps can only reference the branch or loop step itself.',
        ),
        t(
          'Inside a loop, use the loop item for the current element and its index for the position.',
        ),
        t(
          'Reference project configuration as config.key. The value is resolved per environment, so test and production can differ.',
        ),
        t(
          'When a referenced step is deleted or moved, the reference turns invalid and validation reports an error.',
        ),
      ],
    },
    {
      id: 'errors',
      icon: ShieldAlert,
      title: t('Error handling and retries'),
      body: [
        t(
          'App, code, AI and JSON steps have an error handling setting: stop, continue, add an error branch, or retry first and then do one of those.',
        ),
        t(
          'Custom rules match error codes from top to bottom and stop at the first match, for example retry on 429 and stop on 400.',
        ),
        t(
          'Failed runs can be rerun from the failed step; earlier successful steps keep their results. Many failures can be rerun together from the issue center.',
        ),
        t(
          'Trigger run settings can turn on deduplication so the same event is processed only once within a time window.',
        ),
      ],
    },
    {
      id: 'environments',
      icon: SlidersHorizontal,
      title: t('Environments and project configuration'),
      body: [
        t(
          'Project configuration holds values shared by workflows, such as group IDs, thresholds or callback URLs. Reference them as config.key.',
        ),
        t(
          'Projects only have production by default. Turn on test and production environments to give configuration values per environment and to swap connections for test accounts.',
        ),
        t(
          'With environments on, publishing goes to test first; promoting to production can require approval. Roll back to any earlier version from version history.',
        ),
        t(
          'When you test a workflow you choose which environment’s values and connections to use. Production creates real data.',
        ),
      ],
    },
    {
      id: 'mapping',
      icon: ArrowLeftRight,
      title: t('Field mapping and mapping tables'),
      body: [
        t(
          'Object inputs can switch to mapping: choose a source for every target field and chain transformations such as trim, to number, date format, default value or table lookup.',
        ),
        t(
          'Turn on item mapping when the source is a list, to produce one target row per item.',
        ),
        t(
          'Save common lookups, like department name to department code, as a mapping table in the project so several workflows can share it. Decide what happens when a key is missing: fail, use a default or keep the original value.',
        ),
        t(
          'AI mapping suggests fields with a confidence score. Review every suggestion before applying it.',
        ),
      ],
    },
    {
      id: 'issues',
      icon: Siren,
      title: t('Issue center and alerts'),
      body: [
        t(
          'Failures of the same workflow, step and error code are grouped into one issue. Connection authorization failures are grouped per connection across workflows.',
        ),
        t(
          'Issues have a status and an assignee. A resolved issue that fails again reopens automatically and is marked as recurring.',
        ),
        t(
          'After fixing the cause, rerun the affected runs from the failed step in one go.',
        ),
        t(
          'Alert policies decide who is told and when. The same issue alerts once per aggregation window, with optional quiet hours and escalation.',
        ),
      ],
    },
    {
      id: 'ai',
      icon: Sparkles,
      title: t('AI assistant and agents'),
      body: [
        t(
          'Describe what you want to automate and AI drafts the steps, the connections it needs and the questions to confirm. Generated steps are marked as pending review.',
        ),
        t(
          'The assistant in the editor explains the workflow, diagnoses the latest failure and proposes changes as a list you confirm before they apply.',
        ),
        t(
          'The AI agent step calls tools within guardrails. Write actions should require human confirmation; the run waits until an approver decides.',
        ),
      ],
    },
    {
      id: 'connections',
      icon: Link2,
      title: t('Connections and permissions'),
      body: [
        t(
          'A connection stores the account and authorization for one app. It can be available to every project or only to selected projects.',
        ),
        t(
          'Share a connection with members as "Can use" (select it in steps) or "Can edit" (change and reconnect it). Shared members never see the secret values.',
        ),
        t(
          'When authorization expires, steps that use the connection show a warning and runs fail until you reconnect it on the Connections page.',
        ),
      ],
    },
    {
      id: 'shortcuts',
      icon: Keyboard,
      title: t('Keyboard shortcuts'),
      body: [
        t('{mod} + K opens global search from anywhere.', { mod }),
        t('{mod} + Z undoes and {mod} + Shift + Z redoes in the editor.', {
          mod,
        }),
        t(
          '{mod} + C copies, {mod} + X cuts and {mod} + V pastes the selected steps.',
          { mod },
        ),
        t(
          'Delete removes the selected steps, {mod} + E skips them, and Esc cancels a drag or closes a panel.',
          { mod },
        ),
        t('{mod} + M toggles the minimap.', { mod }),
      ],
    },
  ];
}

function search({
  articles,
  query,
}: {
  articles: HelpArticle[];
  query: string;
}): HelpArticle[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return articles;
  }
  return articles.filter((article) =>
    [article.title, ...article.body].join(' ').toLowerCase().includes(needle),
  );
}

function modKey(): string {
  return typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent)
    ? '⌘'
    : 'Ctrl';
}

export const helpArticles = {
  list,
  search,
};

export type HelpArticleId =
  | 'quickstart'
  | 'references'
  | 'errors'
  | 'environments'
  | 'mapping'
  | 'issues'
  | 'ai'
  | 'connections'
  | 'shortcuts';

export type HelpArticle = {
  id: HelpArticleId;
  icon: LucideIcon;
  title: string;
  body: string[];
};
