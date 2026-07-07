import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { monthName, monthShort } from '../utils/format';
import { springSheet, springTap } from '../lib/motion';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';

interface Props {
  year: number;
  month: number;
  onSelect: (year: number, month: number) => void;
}

interface MenuRect {
  top: number;
  left: number;
}

export function MonthPicker({ year, month, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(year);
  const [menuRect, setMenuRect] = useState<MenuRect | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setPickerYear(year);
  }, [open, year]);

  useEffect(() => {
    if (!open) return;

    function updateRect() {
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setMenuRect({ top: rect.bottom + 8, left: rect.left + rect.width / 2 });
    }
    updateRect();

    function handleClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [open]);

  return (
    <div className="dropdown" ref={rootRef}>
      <motion.button
        type="button"
        className="month-label month-label-trigger"
        aria-label="Escolher mês"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        whileTap={{ scale: 0.97 }}
        transition={springTap}
        style={{ overflow: 'hidden', position: 'relative' }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={`${year}-${month}`}
            initial={{ y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -14, opacity: 0 }}
            transition={springSheet}
            style={{ display: 'inline-block' }}
          >
            {monthName(month)} <span className="month-year">{year}</span>
          </motion.span>
        </AnimatePresence>
      </motion.button>
      {createPortal(
        <AnimatePresence>
          {open && menuRect && (
            <motion.div
              className="dropdown-menu dropdown-menu-portal month-picker"
              role="dialog"
              aria-label="Escolher mês e ano"
              style={{
                transformOrigin: 'top center',
                position: 'fixed',
                top: menuRect.top,
                left: menuRect.left,
                transform: 'translateX(-50%)',
              }}
              initial={{ opacity: 0, scale: 0.9, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: -6 }}
              transition={springSheet}
            >
              <div className="month-picker-year">
                <motion.button
                  type="button"
                  className="month-arrow month-arrow-small"
                  aria-label="Ano anterior"
                  onClick={() => setPickerYear((y) => y - 1)}
                  whileTap={{ scale: 0.88 }}
                  transition={springTap}
                >
                  <ChevronLeftIcon />
                </motion.button>
                <span>{pickerYear}</span>
                <motion.button
                  type="button"
                  className="month-arrow month-arrow-small"
                  aria-label="Próximo ano"
                  onClick={() => setPickerYear((y) => y + 1)}
                  whileTap={{ scale: 0.88 }}
                  transition={springTap}
                >
                  <ChevronRightIcon />
                </motion.button>
              </div>
              <div className="month-picker-grid">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                  const active = m === month && pickerYear === year;
                  return (
                    <motion.button
                      type="button"
                      key={m}
                      className={`dropdown-item month-picker-item ${active ? 'dropdown-item-active' : ''}`}
                      whileTap={{ scale: 0.94 }}
                      transition={springTap}
                      onClick={() => {
                        onSelect(pickerYear, m);
                        setOpen(false);
                      }}
                    >
                      {monthShort(m)}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
