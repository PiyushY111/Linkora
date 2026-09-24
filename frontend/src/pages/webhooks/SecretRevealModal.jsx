import { useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Copy, Check } from 'lucide-react';
import Modal from '../../components/ui/Modal';

/** Shows a signing secret once, after creation or rotation. */
export default function SecretRevealModal({ secretInfo, onClose }) {
  const [copiedSecret, setCopiedSecret] = useState(false);

  const copySecretToClipboard = (secret) => {
    navigator.clipboard.writeText(secret);
    setCopiedSecret(true);
    toast.success('Secret copied to clipboard');
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  return (
    <Modal
      open={Boolean(secretInfo)}
      onClose={onClose}
      title={secretInfo.title}
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>{secretInfo.subtitle}</span>
        </div>

        <div>
          <span className="field-label">Signing Secret</span>
          <div className="relative flex items-center rounded-lg border border-ink-600 bg-ink-950 p-3">
            <span className="font-mono text-xs text-accent-400 break-all select-all pr-8">
              {secretInfo.secret}
            </span>
            <button
              type="button"
              onClick={() => copySecretToClipboard(secretInfo.secret)}
              className="absolute right-2.5 rounded p-1.5 text-paper-400 hover:bg-ink-800 hover:text-paper-100 transition-colors"
              title="Copy secret"
            >
              {copiedSecret ? (
                <Check size={14} className="text-accent-400" />
              ) : (
                <Copy size={14} />
              )}
            </button>
          </div>
        </div>

        <div className="pt-2">
          <button
            type="button"
            className="btn-primary w-full"
            onClick={onClose}
          >
            I have saved this secret securely
          </button>
        </div>
      </div>
    </Modal>
  );
}
