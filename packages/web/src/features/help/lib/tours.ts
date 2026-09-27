import { t } from 'i18next';

function steps(tourId: TourId): TourStep[] {
  switch (tourId) {
    case 'console':
      return [
        {
          targets: ['nav-projects'],
          title: t('Projects'),
          description: t(
            'Every workflow lives in a project. Permissions and data are isolated between projects, so split them by business line or team.',
          ),
        },
        {
          targets: ['home-start', 'home-projects'],
          title: t('Start here'),
          description: t(
            'Create a project, then create a workflow in it. You can also start from a template.',
          ),
        },
        {
          targets: ['home-recent'],
          title: t('Recently visited'),
          description: t(
            'Workflows and data stores you opened recently show up here, so you can jump back to where you left off.',
          ),
        },
      ];
    case 'editor':
      return [
        {
          targets: ['builder-tool-rail'],
          title: t('Tool rail'),
          description: t(
            'Open the step library, test runs, validation results, project configuration and data stores from here.',
          ),
        },
        {
          targets: ['builder-add-step'],
          title: t('Add steps'),
          description: t(
            'Click the + on a line to add logic, helper, app or AI steps.',
          ),
        },
        {
          targets: ['builder-step'],
          title: t('Configure a step'),
          description: t(
            'Click a step to choose its action and connection and fill in the inputs in the side panel.',
          ),
        },
        {
          targets: ['builder-test'],
          title: t('Test'),
          description: t(
            'Provide sample trigger data and run a test. The input, output and error of every step are recorded.',
          ),
        },
        {
          targets: ['builder-publish'],
          title: t('Publish'),
          description: t(
            'Changes save automatically. Publish to make the new version run.',
          ),
        },
      ];
  }
}

function title(tourId: TourId): string {
  switch (tourId) {
    case 'console':
      return t('Get to know the console');
    case 'editor':
      return t('Get to know the workflow editor');
  }
}

export const tours = {
  steps,
  title,
};

export type TourId = 'console' | 'editor';

export type TourStep = {
  targets: string[];
  title: string;
  description: string;
};
