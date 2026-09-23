import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, AlertCircle, HelpCircle, X, Trash2 } from 'lucide-react';
import { createPortal } from 'react-dom';

/**
 * Enterprise Custom Confirmation Modal
 * Replaces ugly, native browser window.confirm() popups with a sleek,
 * dark-mode, animated dialog adhering to Linkora's design system.
 */
const ConfirmModal = ({
  open = false,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger', // 'danger' | 'warning' | 'info'
  detail = null,
  confirmButtonRef = null,
}) => {
  const defaultConfirmRef = useRef(null);
  const activeConfirmRef = confirmButtonRef || defaultConfirmRef;

  // Keyboard shortcut listener: ESC to cancel, Enter to confirm
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      } else if (e.key === 'Enter') {
        // Only trigger confirm if active element isn't an input/textarea
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea') {
          e.preventDefault();
          onConfirm?.();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, onConfirm]);

  // Auto-focus confirm button on open for instant keyboard interaction
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        activeConfirmRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open, activeConfirmRef]);

  if (typeof document === 'undefined') return null;

  const getVariantConfig = () => {
    switch (variant) {
      case 'danger':
        return {
          icon: <AlertTriangle className="h-5 w-5 text-danger" />,
          badgeClass: 'bg-danger/10 border-danger/25 text-danger shadow-danger/15',
          confirmBtnClass:
            'btn bg-danger text-white hover:bg-danger/90 active:bg-danger/80 focus-visible:ring-danger shadow-lg shadow-danger/20',
          defaultConfirmText: 'Delete Permanently',
        };
      case 'warning':
        return {
          icon: <AlertCircle className="h-5 w-5 text-amber-400" />,
          badgeClass: 'bg-amber-400/10 border-amber-400/25 text-amber-400 shadow-amber-400/15',
          confirmBtnClass:
            'btn bg-amber-500 text-ink-950 font-semibold hover:bg-amber-400 active:bg-amber-600 focus-visible:ring-amber-400 shadow-lg shadow-amber-500/20',
          defaultConfirmText: 'Proceed',
        };
      case 'info':
      default:
        return {
          icon: <HelpCircle className="h-5 w-5 text-accent-400" />,
          badgeClass: 'bg-accent-400/10 border-accent-400/25 text-accent-400 shadow-accent-400/15',
          confirmBtnClass: 'btn-primary',
          defaultConfirmText: 'Confirm',
        };
    }
  };

  const config = getVariantConfig();

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto px-4 py-6 sm:px-6">
          {/* Backdrop blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 bg-ink-950/85 backdrop-blur-md"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Modal Container */}
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
            aria-describedby="confirm-modal-description"
            initial={{ opacity: 0, scale: 0.94, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="panel-elevated relative z-10 w-full max-w-md border border-ink-600 bg-ink-900/95 p-6 shadow-2xl shadow-ink-950/70"
          >
            {/* Top Close Icon */}
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-paper-500 transition-colors hover:bg-ink-800 hover:text-paper-100"
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>

            {/* Content Header with Icon */}
            <div className="flex items-start gap-4">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-md ${config.badgeClass}`}
              >
                {config.icon}
              </div>

              <div className="flex-1 pr-4">
                <h3
                  id="confirm-modal-title"
                  className="text-base font-bold tracking-tight text-paper-100"
                >
                  {title}
                </h3>
                <p
                  id="confirm-modal-description"
                  className="mt-1.5 text-xs sm:text-sm text-paper-400 leading-relaxed"
                >
                  {message}
                </p>

                {/* Optional code/detail snippet */}
                {detail && (
                  <div className="mt-3 rounded-lg border border-ink-700 bg-ink-950/70 px-3 py-2 font-mono text-xs text-paper-300 break-all">
                    {detail}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary w-full sm:w-auto"
              >
                {cancelText}
              </button>
              <button
                ref={activeConfirmRef}
                type="button"
                onClick={onConfirm}
                className={`${config.confirmBtnClass} w-full sm:w-auto`}
              >
                {confirmText || config.defaultConfirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default ConfirmModal;
