import { motion } from 'framer-motion';
import { useMonth } from '../context/MonthContext';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';
import { springTap } from '../lib/motion';
import { MonthPicker } from './MonthPicker';

export function MonthNavigator() {
  const { year, month, goPrev, goNext, setYearMonth } = useMonth();
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
      <MonthPicker year={year} month={month} onSelect={setYearMonth} />
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
