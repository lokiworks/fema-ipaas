import { t } from 'i18next';

const WorkflowEndWidget = () => {
  return (
    <div
      key={'workflow-end-button'}
      id="workflow-end-button"
      role="img"
      aria-label={t('End')}
      className="absolute left-[-4px] top-0 size-2 rounded-full bg-border animate-fade"
    />
  );
};

WorkflowEndWidget.displayName = 'WorkflowEndWidget';
export default WorkflowEndWidget;
