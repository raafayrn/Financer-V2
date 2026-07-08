import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface MonthContextValue {
  year: number;
  month: number;
  goPrev: () => void;
  goNext: () => void;
  setYearMonth: (year: number, month: number) => void;
}

const MonthContext = createContext<MonthContextValue | null>(null);

export function MonthProvider({ children }: { children: ReactNode }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const goPrev = useCallback(() => {
    setMonth((m) => {
      if (m === 1) {
        setYear((y) => y - 1);
        return 12;
      }
      return m - 1;
    });
  }, []);

  const goNext = useCallback(() => {
    setMonth((m) => {
      if (m === 12) {
        setYear((y) => y + 1);
        return 1;
      }
      return m + 1;
    });
  }, []);

  const setYearMonth = useCallback((y: number, m: number) => {
    setYear(y);
    setMonth(m);
  }, []);

  const value = useMemo(
    () => ({ year, month, goPrev, goNext, setYearMonth }),
    [year, month, goPrev, goNext, setYearMonth],
  );

  return <MonthContext.Provider value={value}>{children}</MonthContext.Provider>;
}

export function useMonth(): MonthContextValue {
  const ctx = useContext(MonthContext);
  if (!ctx) throw new Error('useMonth deve ser usado dentro de MonthProvider.');
  return ctx;
}
