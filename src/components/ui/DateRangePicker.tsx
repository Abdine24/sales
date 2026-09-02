import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Check,
  CalendarDays,
  X,
} from 'lucide-react';
import { Button } from './Button';

export interface DateRangePickerProps {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  onChange: (startDate: string, endDate: string) => void;
  align?: 'left' | 'right';
  className?: string;
  placeholder?: string;
}

const PRESETS = [
  { label: "Aujourd'hui", id: 'today' },
  { label: 'Hier', id: 'yesterday' },
  { label: '7 derniers jours', id: '7d' },
  { label: '30 derniers jours', id: '30d' },
  { label: 'Ce mois-ci', id: 'this_month' },
  { label: 'Mois dernier', id: 'last_month' },
  { label: 'Cette année', id: 'this_year' },
  { label: 'Tout l\'historique', id: 'all' },
];

const MONTH_NAMES = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const toYMD = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (ymd: string): string => {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
};

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onChange,
  align = 'right',
  className = '',
  placeholder = 'Sélectionner une période',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Temporary selection state during picking
  const [tempStart, setTempStart] = useState<string>(startDate);
  const [tempEnd, setTempEnd] = useState<string>(endDate);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  // View state for calendar (current month and year displayed)
  const initialDate = startDate ? new Date(startDate) : new Date();
  const [viewYear, setViewYear] = useState<number>(
    isNaN(initialDate.getTime()) ? new Date().getFullYear() : initialDate.getFullYear()
  );
  const [viewMonth, setViewMonth] = useState<number>(
    isNaN(initialDate.getTime()) ? new Date().getMonth() : initialDate.getMonth()
  );

  // Sync temp selection when props change
  useEffect(() => {
    setTempStart(startDate);
    setTempEnd(endDate);
    if (startDate) {
      const d = new Date(startDate);
      if (!isNaN(d.getTime())) {
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
    }
  }, [startDate, endDate]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Navigation handlers
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Day click logic
  const handleDayClick = (dayYmd: string) => {
    if (!tempStart || (tempStart && tempEnd)) {
      // Start a new range selection
      setTempStart(dayYmd);
      setTempEnd('');
    } else if (tempStart && !tempEnd) {
      if (dayYmd < tempStart) {
        setTempEnd(tempStart);
        setTempStart(dayYmd);
      } else {
        setTempEnd(dayYmd);
      }
    }
  };

  // Apply Preset
  const handleApplyPreset = (presetId: string) => {
    const now = new Date();
    const today = toYMD(now);

    let start = today;
    let end = today;

    if (presetId === 'today') {
      start = today;
      end = today;
    } else if (presetId === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      start = toYMD(y);
      end = start;
    } else if (presetId === '7d') {
      const s = new Date(now);
      s.setDate(s.getDate() - 6);
      start = toYMD(s);
      end = today;
    } else if (presetId === '30d') {
      const s = new Date(now);
      s.setDate(s.getDate() - 29);
      start = toYMD(s);
      end = today;
    } else if (presetId === 'this_month') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      start = toYMD(first);
      end = today;
    } else if (presetId === 'last_month') {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      start = toYMD(first);
      end = toYMD(last);
    } else if (presetId === 'this_year') {
      const first = new Date(now.getFullYear(), 0, 1);
      start = toYMD(first);
      end = today;
    } else if (presetId === 'all') {
      start = '2020-01-01';
      end = today;
    }

    setTempStart(start);
    setTempEnd(end);
    onChange(start, end);
    setIsOpen(false);
  };

  const handleValidateSelection = () => {
    const finalStart = tempStart || toYMD(new Date());
    const finalEnd = tempEnd || tempStart || toYMD(new Date());
    if (finalStart > finalEnd) {
      onChange(finalEnd, finalStart);
    } else {
      onChange(finalStart, finalEnd);
    }
    setIsOpen(false);
  };

  const handleReset = () => {
    const now = toYMD(new Date());
    setTempStart(now);
    setTempEnd(now);
    onChange(now, now);
    setIsOpen(false);
  };

  // Generate calendar days for the current viewMonth / viewYear
  const getDaysInMonth = () => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);

    // Monday = 0, Sunday = 6 in European format
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const days: { date: Date; ymd: string; isCurrentMonth: boolean }[] = [];

    // Previous month filler days
    const prevLastDay = new Date(viewYear, viewMonth, 0);
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(viewYear, viewMonth - 1, prevLastDay.getDate() - i);
      days.push({ date: d, ymd: toYMD(d), isCurrentMonth: false });
    }

    // Current month days
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const d = new Date(viewYear, viewMonth, i);
      days.push({ date: d, ymd: toYMD(d), isCurrentMonth: true });
    }

    // Next month filler days to complete 35 or 42 grid cells
    const remaining = 42 - days.length;
    if (remaining > 0 && remaining < 14) {
      for (let i = 1; i <= remaining; i++) {
        const d = new Date(viewYear, viewMonth + 1, i);
        days.push({ date: d, ymd: toYMD(d), isCurrentMonth: false });
      }
    }

    return days;
  };

  const days = getDaysInMonth();
  const todayYmd = toYMD(new Date());

  // Active range range calculation
  const activeStart = tempStart;
  const activeEnd = tempEnd || (hoverDate && tempStart ? (hoverDate < tempStart ? tempStart : hoverDate) : tempStart);
  const isRangeReversed = tempStart && hoverDate && !tempEnd && hoverDate < tempStart;
  const rangeMin = isRangeReversed ? hoverDate : activeStart;
  const rangeMax = isRangeReversed ? tempStart : activeEnd;

  return (
    <div className={`relative inline-block ${className}`} ref={containerRef}>
      {/* Trigger Button (Apple-style Glass Capsule) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all duration-200 glass-card hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-slate-200/60 dark:border-white/10 select-none shadow-sm ${
          isOpen ? 'ring-2 ring-blue-500/40 bg-blue-500/5' : ''
        }`}
      >
        <CalendarDays className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
        <span className="text-slate-800 dark:text-slate-200">
          {startDate && endDate ? (
            startDate === endDate ? (
              formatDisplayDate(startDate)
            ) : (
              <>
                <span>{formatDisplayDate(startDate)}</span>
                <span className="mx-1.5 text-slate-400 font-normal">→</span>
                <span>{formatDisplayDate(endDate)}</span>
              </>
            )
          ) : (
            placeholder
          )}
        </span>
      </button>

      {/* Dropdown Calendar Popup */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className={`absolute top-full mt-2 z-50 ${
              align === 'right' ? 'right-0' : 'left-0'
            } w-[340px] sm:w-[480px] p-4 rounded-2xl glass-panel shadow-2xl border border-slate-200/80 dark:border-white/15 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl text-slate-900 dark:text-white select-none`}
          >
            {/* Header with Title & Close */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200/60 dark:border-white/10">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <CalendarIcon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                    Période & Calendrier
                  </h4>
                  <p className="text-[10px] text-slate-400">
                    Sélectionnez une date de début et de fin
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Presets Bar */}
            <div className="flex items-center gap-1.5 pb-3 mb-3 border-b border-slate-200/50 dark:border-white/10 overflow-x-auto no-scrollbar">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleApplyPreset(preset.id)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 whitespace-nowrap bg-slate-100 dark:bg-slate-800 hover:bg-blue-500/15 hover:text-blue-600 dark:hover:text-blue-400 text-slate-600 dark:text-slate-300 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Calendar Controls (Month / Year Navigation) */}
            <div className="flex items-center justify-between mb-3 px-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                title="Mois précédent"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2">
                <select
                  value={viewMonth}
                  onChange={(e) => setViewMonth(Number(e.target.value))}
                  className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                >
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={name} value={idx}>
                      {name}
                    </option>
                  ))}
                </select>

                <select
                  value={viewYear}
                  onChange={(e) => setViewYear(Number(e.target.value))}
                  className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                >
                  {Array.from({ length: 15 }, (_, i) => 2020 + i).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                title="Mois suivant"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Days of Week Header */}
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {DAY_NAMES.map((day, idx) => (
                <div
                  key={day}
                  className={`text-[10px] font-black uppercase tracking-wider py-1 ${
                    idx >= 5 ? 'text-rose-500 dark:text-rose-400' : 'text-slate-400'
                  }`}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((item) => {
                const isSelectedStart = tempStart === item.ymd;
                const isSelectedEnd = (tempEnd || activeEnd) === item.ymd;
                const isInRange =
                  rangeMin &&
                  rangeMax &&
                  item.ymd >= rangeMin &&
                  item.ymd <= rangeMax;
                const isToday = item.ymd === todayYmd;

                let dayClass = 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800';

                if (!item.isCurrentMonth) {
                  dayClass = 'text-slate-300 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/40';
                }

                if (isInRange) {
                  dayClass = 'bg-blue-500/15 text-blue-600 dark:text-blue-300 font-bold';
                }

                if (isSelectedStart || isSelectedEnd) {
                  dayClass = 'bg-blue-600 text-white font-black shadow-md shadow-blue-500/30';
                }

                return (
                  <button
                    key={item.ymd}
                    type="button"
                    onClick={() => handleDayClick(item.ymd)}
                    onMouseEnter={() => setHoverDate(item.ymd)}
                    onMouseLeave={() => setHoverDate(null)}
                    className={`h-8 w-full rounded-lg text-xs flex flex-col items-center justify-center relative transition-all duration-150 ${dayClass} ${
                      isSelectedStart ? 'rounded-l-lg' : ''
                    } ${isSelectedEnd ? 'rounded-r-lg' : ''}`}
                  >
                    <span>{item.date.getDate()}</span>
                    {isToday && !isSelectedStart && !isSelectedEnd && (
                      <span className="w-1 h-1 rounded-full bg-blue-500 absolute bottom-1" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Inputs & Action Bar */}
            <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="font-semibold text-slate-900 dark:text-white">
                  {tempStart ? formatDisplayDate(tempStart) : '...'}
                </span>
                <span>à</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {tempEnd ? formatDisplayDate(tempEnd) : tempStart ? formatDisplayDate(tempStart) : '...'}
                </span>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Aujourd'hui
                </button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleValidateSelection}
                  icon={<Check className="w-3.5 h-3.5" />}
                >
                  Appliquer
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
