import { For, createMemo } from 'solid-js';

// Native SVG keeps score charts sharp without downloading a charting library.
export default function PerformanceChart(p) {
  const points = createMemo(() =>
    (p.items || []).map((item, index, all) => ({
      ...item,
      value:
        item.score == null || !Number.isFinite(Number(item.score))
          ? null
          : Math.max(0, Math.min(5, Number(item.score))),
      x: 46 + (index + 0.5) * (510 / Math.max(all.length, 1)),
    })),
  );
  const line = createMemo(() => {
    let connected = false;
    return points()
      .map((item) => {
        if (item.value == null) {
          connected = false;
          return '';
        }
        const command = connected ? 'L' : 'M';
        connected = true;
        return `${command}${item.x},${204 - item.value * 36}`;
      })
      .join(' ');
  });
  return (
    <div class="score-chart">
      <svg
        viewBox="0 0 580 235"
        role="img"
        aria-label={p.label || 'Performance scores from 0 to 5. Exact values listed below.'}
      >
        <For each={[0, 1, 2, 3, 4, 5]}>
          {(value) => (
            <g>
              <line
                x1="46"
                x2="556"
                y1={204 - value * 36}
                y2={204 - value * 36}
                class="score-gridline"
              />
              <text x="26" y={208 - value * 36} text-anchor="middle">
                {value}
              </text>
            </g>
          )}
        </For>
        {!p.bar && <path d={line()} fill="none" stroke="var(--accent)" stroke-width="2.5" />}
        <For each={points()}>
          {(item) => (
            <g>
              {item.value != null &&
                (p.bar ? (
                  <rect
                    x={item.x - Math.min(17, 180 / points().length)}
                    y={204 - item.value * 36}
                    width={Math.min(34, 360 / points().length)}
                    height={item.value * 36}
                    rx="4"
                    fill="var(--accent)"
                  />
                ) : (
                  <circle
                    cx={item.x}
                    cy={204 - item.value * 36}
                    r="4"
                    fill="var(--accent)"
                    stroke="var(--surface)"
                    stroke-width="2"
                  />
                ))}
              <title>
                {item.name}: {item.value == null ? 'Not evaluated' : Number(item.score).toFixed(2)}
              </title>
            </g>
          )}
        </For>
      </svg>
      <ul class="score-chart-values">
        <For each={points()}>
          {(item) => (
            <li>
              <span>{item.name}</span>
              <strong>{item.value == null ? '—' : Number(item.score).toFixed(2)}</strong>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}
