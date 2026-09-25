import { describe, it, expect } from 'vitest';

/**
 * Pure positioning calculation helper matching ActionDropdown.jsx logic.
 */
function calculateDropdownStyle({ rect, windowWidth, windowHeight, width, align = 'auto' }) {
  const estimatedHeight = 220;
  const spaceBelow = windowHeight - rect.bottom;
  const spaceAbove = rect.top;
  const openUpward = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;

  const actualWidth = Math.min(width, windowWidth - 16);

  const resolvedAlign =
    align === 'auto'
      ? (rect.left < windowWidth / 2 ? 'left' : 'right')
      : align;

  let horizontalStyle = {};
  if (resolvedAlign === 'left') {
    const left = Math.max(8, Math.min(rect.left, windowWidth - actualWidth - 8));
    horizontalStyle = { left: `${left}px` };
  } else {
    const right = Math.max(8, Math.min(windowWidth - rect.right, windowWidth - actualWidth - 8));
    horizontalStyle = { right: `${right}px` };
  }

  if (openUpward) {
    return {
      position: 'fixed',
      bottom: `${Math.max(8, windowHeight - rect.top + 4)}px`,
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
}

describe('ActionDropdown positioning logic', () => {
  it('correctly aligns left in the sidebar without negative coordinates', () => {
    // Sidebar button on the left: left = 12, right = 228, top = 80, bottom = 120
    const pos = calculateDropdownStyle({
      rect: { left: 12, right: 228, top: 80, bottom: 120 },
      windowWidth: 1440,
      windowHeight: 900,
      width: 270,
      align: 'left',
    });

    expect(pos.left).toBe('12px');
    expect(pos.right).toBeUndefined();
    expect(pos.width).toBe('270px');
    expect(pos.top).toBe('124px');
  });

  it('auto-resolves to left when trigger is in the left half of the viewport', () => {
    const pos = calculateDropdownStyle({
      rect: { left: 50, right: 250, top: 100, bottom: 140 },
      windowWidth: 1200,
      windowHeight: 800,
      width: 200,
      align: 'auto',
    });

    expect(pos.left).toBe('50px');
    expect(pos.right).toBeUndefined();
  });

  it('auto-resolves to right when trigger is in the right half of the viewport (table actions)', () => {
    // Table action 3-dots button on the far right: left = 1150, right = 1180
    const pos = calculateDropdownStyle({
      rect: { left: 1150, right: 1180, top: 300, bottom: 330 },
      windowWidth: 1200,
      windowHeight: 800,
      width: 176,
      align: 'auto',
    });

    expect(pos.right).toBe('20px');
    expect(pos.left).toBeUndefined();
    expect(pos.width).toBe('176px');
  });

  it('clamps left margin to 8px if anchor is flush against screen left edge', () => {
    const pos = calculateDropdownStyle({
      rect: { left: 2, right: 150, top: 100, bottom: 140 },
      windowWidth: 1000,
      windowHeight: 800,
      width: 250,
      align: 'left',
    });

    expect(pos.left).toBe('8px');
  });

  it('clamps width and bounds safely on narrow mobile screens', () => {
    const pos = calculateDropdownStyle({
      rect: { left: 10, right: 200, top: 50, bottom: 90 },
      windowWidth: 320,
      windowHeight: 640,
      width: 350, // requested width larger than mobile screen
      align: 'left',
    });

    // Max actual width is 320 - 16 = 304px
    expect(pos.width).toBe('304px');
    expect(pos.left).toBe('8px');
  });
});
