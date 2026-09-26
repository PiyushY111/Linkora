import { useState } from 'react';
import { Key, RotateCw } from 'lucide-react';
import Modal from '../ui/Modal';

const GRACE_OPTIONS = [
  { hours: 0, label: 'Immediately', hint: 'The old secret stops working now. Receivers must switch before the next delivery.' },
  { hours: 1, label: '1 hour', hint: 'Both secrets sign deliveries for an hour.' },
  { hours: 24, label: '24 hours', hint: 'Recommended: time to deploy the new secret without dropping events.' },
  { hours: 72, label: '72 hours', hint: 'Maximum overlap.' },
];

/**
 * Asks how long the old secret keeps signing alongside the new one, then
 * calls onConfirm(gracePeriodHours).
 */
const WebhookRotateSecretModal = ({ webhook, onClose, onConfirm }) => {
  const [hours, setHours] = useState(24);
  const [isRotating, setIsRotating] = useState(false);

  const submit = async () => {
    setIsRotating(true);
    try {
      await onConfirm(hours);
    } finally {
      setIsRotating(false);
    }
  };

  return (
    <Modal open={Boolean(webhook)} onClose={onClose} title="Rotate Signing Secret" maxWidth="max-w-md">
      <div className="space-y-4">
        <p className="text-xs text-paper-400">
          A new secret is generated for <span className="font-mono text-paper-200 break-all">{webhook?.url}</span>. During
          the overlap, every delivery carries a <code className="text-paper-200">v1=</code> signature for each secret, so
          receivers verify with whichever one they hold.
        </p>

        <fieldset className="space-y-2">
          <legend className="field-label">Keep the old secret valid for</legend>
          {GRACE_OPTIONS.map((opt) => (
            <label
              key={opt.hours}
              className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors ${
                hours === opt.hours ? 'border-accent-400/40 bg-accent-400/5' : 'border-ink-700 bg-ink-950 hover:border-ink-600'
              }`}
            >
              <input
                type="radio"
                name="grace"
                checked={hours === opt.hours}
                onChange={() => setHours(opt.hours)}
                className="mt-0.5 accent-accent-400"
              />
              <div>
                <div className="text-xs font-semibold text-paper-100">{opt.label}</div>
                <div className="text-[11px] text-paper-400">{opt.hint}</div>
              </div>
            </label>
          ))}
        </fieldset>

        <div className="flex gap-3 pt-1">
          <button type="button" className="btn-primary flex-1" onClick={submit} disabled={isRotating}>
            {isRotating ? <RotateCw size={14} className="animate-spin" /> : <Key size={14} />}
            <span>{isRotating ? 'Rotating…' : 'Rotate Secret'}</span>
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default WebhookRotateSecretModal;
