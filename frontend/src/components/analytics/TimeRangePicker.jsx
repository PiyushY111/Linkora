import { useState, useEffect, useRef } from 'react';
import { Calendar, ChevronDown, Check, AlertCircle } from 'lucide-react';

const PRESETS = [
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: '90d', label: '90d' },
  { id: 'ytd', label: 'YTD' },
  { id: 'all', label: 'All' },
  { id: 'custom', label: 'Custom' },
];

export default function TimeRangePicker({
  value = '30d',
  onChange,
  customStart = '',
  customEnd = '',
  className = '',
}) {
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [startDate, setStartDate] = useState(customStart || '');
  const [endDate, setEndDate] = useState(customEnd || '');
  const [error, setError] = useState('');
  const popoverRef = useRef(null);

  // Sync state if props change externally
  useEffect(() => {
    if (customStart) setStartDate(customStart);
    if (customEnd) setEndDate(customEnd);
  }, [customStart, customEnd]);

  // Click outside to dismiss popover
  useEffect(() => {
    if (!showCustomModal) return;
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setShowCustomModal(false);
        setError('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCustomModal]);

  const handlePresetSelect = (presetId) => {
    if (presetId === 'custom') {
      setShowCustomModal((prev) => !prev);
      return;
    }
    setShowCustomModal(false);
    setError('');
    onChange({ timeRange: presetId });
  };

  const applyShortcut = (type) => {
    const today = new Date();
    const formatDate = (d) => d.toISOString().slice(0, 10);
    const todayStr = formatDate(today);

    let start = '';
    let end = todayStr;

    if (type === 'today') {
      start = todayStr;
      end = todayStr;
    } else if (type === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const yStr = formatDate(y);
      start = yStr;
      end = yStr;
    } else if (type === '7d') {
      const d7 = new Date(today);
      d7.setDate(d7.getDate() - 7);
      start = formatDate(d7);
    } else if (type === '30d') {
      const d30 = new Date(today);
      d30.setDate(d30.getDate() - 30);
      start = formatDate(d30);
    } else if (type === 'thisMonth') {
      const mStart = new Date(today.getFullYear(), today.getMonth(), 1);
      start = formatDate(mStart);
    }

    setStartDate(start);
    setEndDate(end);
    setError('');

    onChange({
      timeRange: 'custom',
      startDate: start,
      endDate: end,
    });
    setShowCustomModal(false);
  };

  const handleApplyCustom = (e) => {
    e?.preventDefault();
    if (!startDate) {
      setError('Please select a start date');
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const resolvedEnd = endDate || todayStr;

    if (startDate > resolvedEnd) {
      setError('Start date cannot be after end date');
      return;
    }

    setError('');
    onChange({
      timeRange: 'custom',
      startDate,
      endDate: resolvedEnd,
    });
    setShowCustomModal(false);
  };

  const formatDisplayDate = (dStr) => {
    if (!dStr) return '';
    try {
      const [y, m, d] = dStr.split('-');
      const date = new Date(y, m - 1, d);
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return dStr;
    }
  };

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div ref={popoverRef} className={`relative ${showCustomModal ? 'z-50' : 'z-20'} flex items-center gap-2 ${className}`}>
      {/* Segmented pill group */}
      <div className="inline-flex h-8.5 items-center rounded-xl bg-ink-900/90 p-1 ring-1 ring-ink-700/80 shadow-inner">
        {PRESETS.map((p) => {
          const isActive = value === p.id || (p.id === 'custom' && (value === 'custom' || showCustomModal));
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePresetSelect(p.id)}
              className={`relative h-6.5 rounded-lg px-2.5 text-xs font-medium transition-all duration-150 cursor-pointer ${
                isActive
                  ? 'bg-accent-400 text-ink-950 font-bold shadow-sm shadow-accent-400/20'
                  : 'text-paper-400 hover:text-paper-100 hover:bg-ink-800/60'
              }`}
            >
              <span>{p.label}</span>
            </button>
          );
        })}
      </div>

      {/* Custom date range trigger badge */}
      {value === 'custom' && (
        <button
          type="button"
          onClick={() => setShowCustomModal((prev) => !prev)}
          className="inline-flex h-8.5 items-center gap-1.5 rounded-xl border border-accent-400/30 bg-accent-400/10 px-2.5 text-xs text-accent-400 hover:bg-accent-400/15 transition-colors cursor-pointer"
        >
          <Calendar size={13} className="text-accent-400" />
          <span className="font-mono text-[11px] font-medium">
            {customStart ? formatDisplayDate(customStart) : 'Start'} → {customEnd ? formatDisplayDate(customEnd) : 'Today'}
          </span>
          <ChevronDown size={13} className="text-accent-400/70" />
        </button>
      )}

      {/* Custom Date Popover */}
      {showCustomModal && (
        <div className="absolute left-0 top-full z-50 mt-2 w-80 rounded-2xl border border-ink-600 bg-ink-900/98 p-4 shadow-2xl ring-1 ring-black/50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-3 border-b border-ink-800">
            <div className="flex items-center gap-1.5">
              <Calendar size={14} className="text-accent-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-paper-200">
                Custom Analytics Range
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowCustomModal(false);
                setError('');
              }}
              className="text-paper-500 hover:text-paper-200 text-xs p-1 rounded-md hover:bg-ink-800 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Quick preset buttons */}
          <div className="mt-3">
            <span className="text-[10px] uppercase font-semibold text-paper-500 tracking-wider">Quick Presets</span>
            <div className="grid grid-cols-3 gap-1.5 mt-1.5">
              <button
                type="button"
                onClick={() => applyShortcut('today')}
                className="rounded-lg border border-ink-750 bg-ink-850 px-2 py-1 text-[11px] text-paper-300 hover:border-accent-400/40 hover:text-accent-400 hover:bg-ink-800 transition-colors"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => applyShortcut('yesterday')}
                className="rounded-lg border border-ink-750 bg-ink-850 px-2 py-1 text-[11px] text-paper-300 hover:border-accent-400/40 hover:text-accent-400 hover:bg-ink-800 transition-colors"
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => applyShortcut('7d')}
                className="rounded-lg border border-ink-750 bg-ink-850 px-2 py-1 text-[11px] text-paper-300 hover:border-accent-400/40 hover:text-accent-400 hover:bg-ink-800 transition-colors"
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => applyShortcut('30d')}
                className="rounded-lg border border-ink-750 bg-ink-850 px-2 py-1 text-[11px] text-paper-300 hover:border-accent-400/40 hover:text-accent-400 hover:bg-ink-800 transition-colors"
              >
                Last 30 Days
              </button>
              <button
                type="button"
                onClick={() => applyShortcut('thisMonth')}
                className="col-span-2 rounded-lg border border-ink-750 bg-ink-850 px-2 py-1 text-[11px] text-paper-300 hover:border-accent-400/40 hover:text-accent-400 hover:bg-ink-800 transition-colors"
              >
                This Month
              </button>
            </div>
          </div>

          <form onSubmit={handleApplyCustom} className="mt-3.5 space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-paper-400 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                max={todayIso}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setError('');
                }}
                className="input py-1.5 text-xs w-full font-mono"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-paper-400 mb-1">
                End Date (Optional)
              </label>
              <input
                type="date"
                value={endDate}
                max={todayIso}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setError('');
                }}
                className="input py-1.5 text-xs w-full font-mono"
              />
              <span className="block text-[10px] text-paper-500 mt-0.5">Defaults to today if blank</span>
            </div>

            {error && (
              <div className="flex items-center gap-1.5 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2">
                <AlertCircle size={13} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-ink-800">
              <button
                type="button"
                onClick={() => {
                  setShowCustomModal(false);
                  setError('');
                }}
                className="btn-ghost py-1 px-3 text-xs"
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary py-1 px-3 text-xs">
                Apply Window
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
