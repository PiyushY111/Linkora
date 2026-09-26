import { useEffect, useRef, useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { GripVertical, ArrowUp, ArrowDown, Trash2, EyeOff } from 'lucide-react';
import { QR_BRAND_ICONS } from '../../../utils/qrPresets';

const sameOrder = (a, b) => a.length === b.length && a.every((item, i) => item._id === b[i]._id);

// Why an item won't appear on the public page, if it won't.
function hiddenReason(item) {
  if (!item.active) return 'Hidden';
  if (!item.link) return 'Link no longer in this workspace — hidden';
  if (!item.link.isActive) return 'Link paused — hidden';
  return null;
}

const LabelInput = ({ item, onSave, disabled }) => {
  const [value, setValue] = useState(item.label);
  useEffect(() => setValue(item.label), [item.label]);

  const commit = () => {
    const label = value.trim();
    if (!label || label === item.label) {
      setValue(item.label);
      return;
    }
    onSave({ label });
  };

  return (
    <input
      type="text"
      value={value}
      maxLength={100}
      disabled={disabled}
      aria-label="Item label"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setValue(item.label);
          e.currentTarget.blur();
        }
      }}
      className="input py-1.5 text-sm"
    />
  );
};

const ItemRow = ({ item, index, count, canEdit, onDragStart, onDragEnd, onMove, onUpdate, onRemove }) => {
  const dragControls = useDragControls();
  const reason = hiddenReason(item);

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={dragControls}
      onDragEnd={onDragEnd}
      className="flex items-start gap-2 rounded-xl border border-ink-700 bg-ink-900 p-3"
    >
      {canEdit && (
        <button
          type="button"
          onPointerDown={(e) => {
            onDragStart();
            dragControls.start(e);
          }}
          className="mt-1.5 cursor-grab touch-none rounded p-1 text-paper-500 hover:bg-ink-800 hover:text-paper-200 active:cursor-grabbing"
          aria-label={`Drag to reorder ${item.label}`}
        >
          <GripVertical size={16} />
        </button>
      )}

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex gap-2">
          <LabelInput item={item} disabled={!canEdit} onSave={(changes) => onUpdate(item._id, changes)} />
          <select
            value={item.icon || ''}
            disabled={!canEdit}
            aria-label="Item icon"
            onChange={(e) => onUpdate(item._id, { icon: e.target.value })}
            className="input w-32 shrink-0 py-1.5 text-xs"
          >
            <option value="">No icon</option>
            {QR_BRAND_ICONS.map((icon) => (
              <option key={icon.id} value={icon.id}>
                {icon.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="truncate font-mono text-paper-500">{item.link?.shortUrl ?? '—'}</span>
          {reason && (
            <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-300">
              <EyeOff size={11} />
              {reason}
            </span>
          )}
        </div>
      </div>

      {canEdit && (
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => onMove(index, -1)}
            disabled={index === 0}
            className="rounded p-1.5 text-paper-500 hover:bg-ink-800 hover:text-paper-200 disabled:opacity-30"
            aria-label={`Move ${item.label} up`}
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            onClick={() => onMove(index, 1)}
            disabled={index === count - 1}
            className="rounded p-1.5 text-paper-500 hover:bg-ink-800 hover:text-paper-200 disabled:opacity-30"
            aria-label={`Move ${item.label} down`}
          >
            <ArrowDown size={14} />
          </button>
          <button
            type="button"
            onClick={() => onRemove(item)}
            className="rounded p-1.5 text-paper-500 hover:bg-rose-500/10 hover:text-rose-400"
            aria-label={`Remove ${item.label}`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </Reorder.Item>
  );
};

/**
 * Drag (by the handle) or use the arrows to reorder; the order is saved
 * once, on drop. Labels save on blur/Enter, icons on change.
 */
const BioItemList = ({ items, canEdit, onPreviewOrder, onSaveOrder, onUpdate, onRemove }) => {
  const latestItems = useRef(items);
  latestItems.current = items;
  const orderAtDragStart = useRef(null);

  const handleDragEnd = () => {
    const before = orderAtDragStart.current;
    orderAtDragStart.current = null;
    if (before && !sameOrder(before, latestItems.current)) onSaveOrder(latestItems.current);
  };

  const handleMove = (index, delta) => {
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(index + delta, 0, moved);
    onSaveOrder(next);
  };

  return (
    <Reorder.Group axis="y" values={items} onReorder={onPreviewOrder} className="space-y-2">
      {items.map((item, index) => (
        <ItemRow
          key={item._id}
          item={item}
          index={index}
          count={items.length}
          canEdit={canEdit}
          onDragStart={() => {
            orderAtDragStart.current = items;
          }}
          onDragEnd={handleDragEnd}
          onMove={handleMove}
          onUpdate={onUpdate}
          onRemove={onRemove}
        />
      ))}
    </Reorder.Group>
  );
};

export default BioItemList;
