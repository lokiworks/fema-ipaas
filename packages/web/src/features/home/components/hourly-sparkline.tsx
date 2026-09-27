import { t } from 'i18next';

export function HourlySparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const barWidth = VIEW_WIDTH / Math.max(1, values.length);
  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      className="h-10 w-full text-primary"
      role="img"
      aria-label={t('Runs per hour today')}
    >
      {values.map((value, hour) => {
        const height =
          value === 0 ? 1 : Math.max(2, (value / max) * VIEW_HEIGHT);
        return (
          <rect
            key={hour}
            x={hour * barWidth + BAR_GAP / 2}
            y={VIEW_HEIGHT - height}
            width={Math.max(1, barWidth - BAR_GAP)}
            height={height}
            rx={1}
            className={value === 0 ? 'fill-muted' : 'fill-current'}
          >
            <title>
              {t('{hour}:00 · {count} runs', { hour, count: value })}
            </title>
          </rect>
        );
      })}
    </svg>
  );
}

const VIEW_WIDTH = 280;
const VIEW_HEIGHT = 40;
const BAR_GAP = 2;
