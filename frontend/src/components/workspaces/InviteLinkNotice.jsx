import { useState } from 'react';
import { Copy, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';

// Shows a freshly created invite link once, with a copy button. The link
// can't be fetched again later (only its hash is stored); resend makes a new one.
const InviteLinkNotice = ({ invite, onDismiss }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
      toast.success('Invite link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy; select the link and copy it manually');
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-accent-400/25 bg-accent-400/5 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-xs text-paper-300">
          Share this link with <span className="font-semibold text-paper-100">{invite.email}</span>. It works once,
          for that email, for 7 days, and won&apos;t be shown again.
        </p>
        <button type="button" onClick={onDismiss} className="text-paper-500 hover:text-paper-200" aria-label="Dismiss">
          <X size={14} />
        </button>
      </div>
      <div className="relative flex items-center">
        <input readOnly value={invite.url} className="input pr-10 font-mono text-xs" onFocus={(e) => e.target.select()} />
        <button
          type="button"
          onClick={handleCopy}
          className="absolute right-2.5 rounded p-1.5 text-paper-400 transition-colors hover:bg-ink-800 hover:text-paper-100"
          aria-label="Copy invite link"
        >
          {copied ? <Check size={14} className="text-accent-400" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
};

export default InviteLinkNotice;
