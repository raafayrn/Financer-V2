import { motion } from 'framer-motion';
import type { BudgetStatus } from '../api/types';
import { springFill } from '../lib/motion';

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
      <motion.div
        className={`progress-fill status-${status}`}
        initial={false}
        animate={{ width: `${width}%` }}
        transition={springFill}
      />
    </div>
  );
}
