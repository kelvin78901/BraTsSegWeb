import { useViewerStore } from '../store/viewerStore';

export default function MetricsCard() {
  const metrics = useViewerStore((s) => s.metrics);

  if (!metrics) return null;

  const items = [
    { label: 'Whole Tumor', key: 'WT_dice', color: 'var(--cyan2)' },
    { label: 'Tumor Core', key: 'TC_dice', color: 'var(--purple2)' },
    { label: 'Enhancing', key: 'ET_dice', color: 'var(--green)' },
  ];

  return (
    <div className="card">
      <div className="card-title">Segmentation Metrics (Dice)</div>
      <div className="kpi-grid">
        {items.map((it) => {
          const val = metrics[it.key];
          const display = val !== undefined ? val.toFixed(4) : '--';
          return (
            <div className="kpi-box" key={it.key}>
              <div className="kpi-label">{it.label}</div>
              <div className="kpi-value" style={{ color: it.color }}>{display}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
