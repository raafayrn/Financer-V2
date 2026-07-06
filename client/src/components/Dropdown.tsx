import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { springSheet, springTap } from '../lib/motion';

interface DropdownOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
}

export function Dropdown({ value, options, onChange, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="dropdown" ref={rootRef}>
      <motion.button
        type="button"
        className={`dropdown-trigger ${open ? 'dropdown-trigger-open' : ''}`}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        whileTap={{ scale: 0.98 }}
        transition={springTap}
      >
        <span>{selected?.label ?? ''}</span>
        <motion.svg
          className="dropdown-chevron"
          viewBox="0 0 24 24"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          animate={{ rotate: open ? 180 : 0 }}
          transition={springTap}
        >
          <path d="M6 9l6 6 6-6" />
        </motion.svg>
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="dropdown-menu"
            role="listbox"
            style={{ transformOrigin: 'top center' }}
            initial={{ opacity: 0, scale: 0.9, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -6 }}
            transition={springSheet}
          >
            {options.map((o) => (
              <motion.button
                type="button"
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                className={`dropdown-item ${o.value === value ? 'dropdown-item-active' : ''}`}
                whileTap={{ scale: 0.97 }}
                transition={springTap}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
