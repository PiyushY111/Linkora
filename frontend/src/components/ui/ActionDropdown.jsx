import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * ActionDropdown
 * 
 * Renders a floating dropdown menu anchored to a trigger button using React Portal (document.body).
 * This completely prevents clipping caused by `overflow-x-auto`, `overflow-hidden`, or table containers,
 * and ensures highest stacking z-index on top of all page elements.
 */
export default function ActionDropdown({
  isOpen,
  onClose,
  anchorEl,
  children,
  width = 176,
  align = 'auto',
}) {
  const [style, setStyle] = useState(null);

  const calculatePosition = useCallback(() => {
    if (!anchorEl) return null;
    const rect = anchorEl.getBoundingClientRect();
    const estimatedHeight = 220;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;

    const actualWidth = Math.min(width, window.innerWidth - 16);

    // Resolve horizontal alignment:
    // If align === 'auto', pick 'left' when anchor is on the left half of the viewport (e.g. sidebar),
    // and 'right' when anchor is on the right half (e.g. table rows or cards).
    const resolvedAlign =
      align === 'auto'
        ? (rect.left < window.innerWidth / 2 ? 'left' : 'right')
        : align;

    let horizontalStyle = {};
    if (resolvedAlign === 'left') {
      // Align to trigger element's left edge, ensuring it never clips on the left (min 8px) or right
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - actualWidth - 8));
      horizontalStyle = { left: `${left}px` };
    } else {
      // Align to trigger element's right edge, ensuring it never overflows off left or right
      const right = Math.max(8, Math.min(window.innerWidth - rect.right, window.innerWidth - actualWidth - 8));
      horizontalStyle = { right: `${right}px` };
    }

    if (openUpward) {
      return {
        position: 'fixed',
        bottom: `${Math.max(8, window.innerHeight - rect.top + 4)}px`,
        ...horizontalStyle,
        width: `${actualWidth}px`,
        maxHeight: `${Math.max(120, spaceAbove - 16)}px`,
      };
    } else {
      return {
        position: 'fixed',
        top: `${Math.max(8, rect.bottom + 4)}px`,
        ...horizontalStyle,
        width: `${actualWidth}px`,
        maxHeight: `${Math.max(120, spaceBelow - 16)}px`,
      };
    }
  }, [anchorEl, width, align]);

  useEffect(() => {
    if (!isOpen || !anchorEl) {
      setStyle(null);
      return;
    }

    setStyle(calculatePosition());

    const handleScrollOrResize = (e) => {
      // Don't close if user is scrolling inside the dropdown itself
      if (e?.target?.closest && e.target.closest('[data-action-dropdown]')) return;
      onClose();
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, anchorEl, onClose, calculatePosition]);

  if (!isOpen || !style) return null;

  return createPortal(
    <>
      {/* Invisible backdrop to dismiss on click outside */}
      <div
        className="fixed inset-0 z-[9998] cursor-default bg-transparent"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />

      {/* Floating Menu Container */}
      <div
        data-action-dropdown
        style={style}
        className="z-[9999] overflow-y-auto overflow-x-hidden rounded-xl border border-ink-600 bg-ink-850/98 py-1 shadow-2xl backdrop-blur-md ring-1 ring-black/50 text-left animate-in fade-in zoom-in-95 duration-100 scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>,
    document.body
  );
}
