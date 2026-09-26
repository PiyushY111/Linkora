import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import Sidebar, { SidebarContent } from './Sidebar';
import AppBrand from './AppBrand';

const DESKTOP_QUERY = '(min-width: 1024px)';
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
const EASE_OUT = [0.16, 1, 0.3, 1];

/** Keeps Tab inside the panel; Escape closes it unless a dropdown inside is open. */
function handlePanelKeyDown(event, panel, close) {
  if (event.key === 'Escape') {
    if (document.querySelector('[data-action-dropdown]')) return;
    close();
    return;
  }
  if (event.key !== 'Tab' || !panel) return;
  const focusable = [...panel.querySelectorAll(FOCUSABLE)];
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

const MobileNav = () => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return undefined;
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    // Growing past the breakpoint hides this panel; don't leave the page scroll-locked.
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e) => { if (e.matches) setOpen(false); };
    desktop.addEventListener('change', onChange);

    return () => {
      document.body.style.overflow = previousOverflow;
      desktop.removeEventListener('change', onChange);
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink-700 bg-ink-950/85 px-4 backdrop-blur-md lg:hidden">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          className="-ml-1.5 rounded-lg p-2 text-paper-300 transition-colors duration-150 hover:bg-ink-800 hover:text-paper-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper-500"
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="mobile-navigation"
        >
          <Menu size={20} />
        </button>
        <AppBrand />
      </header>

      <AnimatePresence>
        {open && (
          <div className="lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-ink-950/80 backdrop-blur-sm"
              onClick={close}
              aria-hidden="true"
            />
            <motion.div
              ref={panelRef}
              id="mobile-navigation"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
              onKeyDown={(e) => handlePanelKeyDown(e, panelRef.current, close)}
              className="panel-elevated fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] rounded-l-none border-l-0"
            >
              <SidebarContent
                onNavigate={close}
                headerAction={
                  <button
                    ref={closeRef}
                    type="button"
                    onClick={close}
                    className="-mr-1.5 rounded-lg p-2 text-paper-300 transition-colors duration-150 hover:bg-ink-700 hover:text-paper-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper-500"
                    aria-label="Close menu"
                  >
                    <X size={20} />
                  </button>
                }
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

const AppShell = ({ children }) => {
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-ink-950">
        <Sidebar />
        <MobileNav />
        <main className="lg:pl-60">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">{children}</div>
        </main>
      </div>
    </MotionConfig>
  );
};

export default AppShell;
