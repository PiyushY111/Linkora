import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

const Modal = ({ open, onClose, title, children, maxWidth = 'max-w-lg' }) => {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-10 sm:items-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-ink-950/80 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={`panel-elevated relative z-10 flex flex-col w-full ${maxWidth} max-h-[calc(100vh-3rem)] sm:max-h-[90vh] overflow-hidden p-6`}
          >
            <div className="mb-4 flex shrink-0 items-center justify-between">
              <h2 className="text-lg font-semibold text-paper-100">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-paper-500 transition-colors hover:bg-ink-700 hover:text-paper-100"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 pr-1 -mr-1">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default Modal;
