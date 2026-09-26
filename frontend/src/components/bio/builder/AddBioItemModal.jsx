import { useEffect, useState } from 'react';
import { Link2, Search, Loader2, Check } from 'lucide-react';
import Modal from '../../ui/Modal';
import { linkService } from '../../../services';
import { QR_BRAND_ICONS } from '../../../utils/qrPresets';

const LINK_SEARCH_DEBOUNCE_MS = 300;
const LINK_PICKER_LIMIT = 20;

const MODES = [
  { id: 'url', label: 'Paste a URL' },
  { id: 'existing', label: 'Pick an existing link' },
];

/** The workspace's links matching `search`, refetched once typing pauses. */
function useLinkSearch(search, isEnabled) {
  const [state, setState] = useState({ links: [], isLoading: false, error: null });

  useEffect(() => {
    if (!isEnabled) return undefined;
    let isCancelled = false;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    const timer = setTimeout(async () => {
      try {
        const res = await linkService.getLinks({ search: search.trim() || undefined, limit: LINK_PICKER_LIMIT });
        if (!isCancelled) setState({ links: res.links || [], isLoading: false, error: null });
      } catch (err) {
        if (!isCancelled) {
          setState({ links: [], isLoading: false, error: err.response?.data?.message || 'Failed to load links' });
        }
      }
    }, LINK_SEARCH_DEBOUNCE_MS);
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [search, isEnabled]);

  return state;
}

const LinkPicker = ({ selectedId, onSelect, isEnabled }) => {
  const [search, setSearch] = useState('');
  const { links, isLoading, error } = useLinkSearch(search, isEnabled);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-paper-500" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your links"
          aria-label="Search your links"
          className="input pl-9"
        />
      </div>
      <div className="max-h-56 overflow-y-auto rounded-lg border border-ink-700" role="listbox" aria-label="Your links">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-paper-400">
            <Loader2 size={14} className="animate-spin" /> Loading links…
          </div>
        )}
        {!isLoading && error && <p className="py-6 text-center text-xs text-rose-400">{error}</p>}
        {!isLoading && !error && links.length === 0 && (
          <p className="py-6 text-center text-xs text-paper-500">No links match.</p>
        )}
        {!isLoading &&
          !error &&
          links.map((link) => {
            const isSelected = link._id === selectedId;
            return (
              <button
                key={link._id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelect(link)}
                className={`flex w-full items-center gap-3 border-b border-ink-800 px-3 py-2.5 text-left last:border-b-0 transition-colors ${
                  isSelected ? 'bg-accent-400/10' : 'hover:bg-ink-800/60'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-paper-100">{link.title || link.shortCode}</p>
                  <p className="truncate font-mono text-[11px] text-paper-500">{link.originalUrl}</p>
                </div>
                {isSelected && <Check size={14} className="shrink-0 text-accent-400" />}
              </button>
            );
          })}
      </div>
    </div>
  );
};

const AddBioItemModal = ({ open, onClose, onAdd }) => {
  const [mode, setMode] = useState('url');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [selectedLink, setSelectedLink] = useState(null);
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode('url');
    setDestinationUrl('');
    setSelectedLink(null);
    setLabel('');
    setIcon('');
  }, [open]);

  const handleSelectLink = (link) => {
    setSelectedLink(link);
    if (!label.trim()) setLabel(link.title || link.shortCode);
  };

  const target = mode === 'url' ? destinationUrl.trim() : selectedLink?._id;
  const canSubmit = Boolean(target) && Boolean(label.trim()) && !isSubmitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    const source = mode === 'url' ? { destinationUrl: destinationUrl.trim() } : { linkId: selectedLink._id };
    const isAdded = await onAdd({ ...source, label: label.trim(), icon });
    setIsSubmitting(false);
    if (isAdded) onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Add a link to your page" maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="inline-flex w-full rounded-lg border border-ink-700 bg-ink-950 p-0.5">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              aria-pressed={mode === m.id}
              className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                mode === m.id ? 'bg-ink-800 text-paper-100 shadow-sm' : 'text-paper-400 hover:text-paper-200'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'url' ? (
          <div>
            <label htmlFor="bio-item-url" className="field-label">
              Destination URL
            </label>
            <div className="relative">
              <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-paper-500" />
              <input
                id="bio-item-url"
                type="text"
                inputMode="url"
                value={destinationUrl}
                onChange={(e) => setDestinationUrl(e.target.value)}
                placeholder="https://example.com"
                className="input pl-9"
                autoFocus
              />
            </div>
            <p className="mt-1.5 text-[11px] text-paper-500">
              Creates a new short link in this workspace, tracked like any other.
            </p>
          </div>
        ) : (
          <LinkPicker selectedId={selectedLink?._id} onSelect={handleSelectLink} isEnabled={open && mode === 'existing'} />
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <div>
            <label htmlFor="bio-item-label" className="field-label">
              Button label
            </label>
            <input
              id="bio-item-label"
              type="text"
              value={label}
              maxLength={100}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="My portfolio"
              className="input"
            />
          </div>
          <div>
            <label htmlFor="bio-item-icon" className="field-label">
              Icon
            </label>
            <select id="bio-item-icon" value={icon} onChange={(e) => setIcon(e.target.value)} className="input">
              <option value="">No icon</option>
              {QR_BRAND_ICONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={!canSubmit} className="btn-primary disabled:opacity-50">
            {isSubmitting ? 'Adding…' : 'Add to page'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default AddBioItemModal;
