import { useMonth } from '../context/MonthContext';
import { monthName } from '../utils/format';

export function MonthNavigator() {
  const { year, month, goPrev, goNext } = useMonth();
  return (
    <div className="month-nav">
      <button className="month-arrow" onClick={goPrev} aria-label="Mês anterior">
        ‹
      </button>
      <div className="month-label">
        {monthName(month)} <span className="month-year">{year}</span>
      </div>
      <button className="month-arrow" onClick={goNext} aria-label="Próximo mês">
        ›
      </button>
    </div>
  );
}
