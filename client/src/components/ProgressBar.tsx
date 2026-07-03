import type { BudgetStatus } from '../api/types';

export function ProgressBar({
  percent,
  status,
}: {
  percent: number; // 0..>1
  status: BudgetStatus;
}) {
  const width = Math.min(percent, 1) * 100;
  return (
    <div className="progress-track">
      <div
        className={`progress-fill status-${status}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
