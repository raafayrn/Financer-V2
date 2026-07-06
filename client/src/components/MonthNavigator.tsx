import { AnimatePresence, motion } from 'framer-motion';
import { useMonth } from '../context/MonthContext';
import { monthName } from '../utils/format';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';
import { springSmooth, springTap } from '../lib/motion';

export function MonthNavigator() {
  const { year, month, goPrev, goNext } = useMonth();
  return (
    <div className="month-nav">
      <motion.button
        className="month-arrow"
        onClick={goPrev}
        aria-label="Mês anterior"
        whileTap={{ scale: 0.88 }}
        transition={springTap}
      >
        <ChevronLeftIcon />
      </motion.button>
      <div className="month-label" style={{ overflow: 'hidden', position: 'relative' }}>
        <AnimatePresence mode="popLayout" initial={false} custom={month}>
          <motion.span
            key={`${year}-${month}`}
            initial={{ y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -14, opacity: 0 }}
            transition={springSmooth}
            style={{ display: 'inline-block' }}
          >
            {monthName(month)} <span className="month-year">{year}</span>
          </motion.span>
        </AnimatePresence>
      </div>
      <motion.button
        className="month-arrow"
        onClick={goNext}
        aria-label="Próximo mês"
        whileTap={{ scale: 0.88 }}
        transition={springTap}
      >
        <ChevronRightIcon />
      </motion.button>
    </div>
  );
}
