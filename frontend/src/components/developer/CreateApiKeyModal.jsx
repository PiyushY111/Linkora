import { useState } from 'react';
import { Key, AlertTriangle, Copy, Check, RotateCw, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import { developerService } from '../../services';

const SCOPES_CONFIG = [
  { value: 'links:read', label: 'links:read', desc: 'Read and search shortened links' },
  { value: 'links:write', label: 'links:write', desc: 'Create and update short links and bulk batches' },
  { value: 'links:delete', label: 'links:delete', desc: 'Delete links permanently' },
  { value: 'analytics:read', label: 'analytics:read', desc: 'Access click stream and geographic analytics' },
  { value: 'webhooks:read', label: 'webhooks:read', desc: 'Inspect webhook subscriptions and delivery logs' },
  { value: 'webhooks:write', label: 'webhooks:write', desc: 'Create and configure webhook endpoints' },
];

const CreateApiKeyModal = ({ open, onClose, onCreated }) => {
  const [formData, setFormData] = useState({
    name: '',
    environment: 'live',
    scopes: ['links:read', 'links:write', 'analytics:read'],
    expiresInDays: '0',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState(null);
  const [copied, setCopied] = useState(false);

  const toggleScope = (scope) => {
    setFormData((prev) => ({
      ...prev,
      scopes: prev.scopes.includes(scope)
        ? prev.scopes.filter((s) => s !== scope)
        : [...prev.scopes, scope],
    }));
  };

  const toggleAllScopes = () => {
    if (formData.scopes.length === SCOPES_CONFIG.length) {
      setFormData((prev) => ({ ...prev, scopes: [] }));
    } else {
      setFormData((prev) => ({ ...prev, scopes: SCOPES_CONFIG.map((s) => s.value) }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Key name is required');
      return;
    }
    if (formData.scopes.length === 0) {
      toast.error('Select at least one scope');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await developerService.createKey({
        name: formData.name.trim(),
        environment: formData.environment,
        scopes: formData.scopes,
        expiresInDays: parseInt(formData.expiresInDays, 10),
      });

      setRevealedSecret(res.rawSecret);
      toast.success('API Key generated successfully');
      if (onCreated) onCreated();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create API key');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copySecret = () => {
    if (!revealedSecret) return;
    navigator.clipboard.writeText(revealedSecret);
    setCopied(true);
    toast.success('Secret copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCloseAll = () => {
    setRevealedSecret(null);
    setFormData({
      name: '',
      environment: 'live',
      scopes: ['links:read', 'links:write', 'analytics:read'],
      expiresInDays: '0',
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleCloseAll}
      title={revealedSecret ? 'API Key Created' : 'Create New API Key'}
      maxWidth="max-w-lg"
    >
      {revealedSecret ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Save your key now:</span> For security reasons, you will not be able to view this full secret key again.
            </div>
          </div>

          <div>
            <label className="field-label">Your API Key</label>
            <div className="relative flex items-center rounded-lg border border-ink-600 bg-ink-950 p-3">
              <span className="font-mono text-xs text-accent-400 break-all select-all pr-8">
                {revealedSecret}
              </span>
              <button
                type="button"
                onClick={copySecret}
                className="absolute right-2.5 rounded p-1.5 text-paper-400 hover:bg-ink-800 hover:text-paper-100 transition-colors"
                title="Copy API key"
              >
                {copied ? <Check size={14} className="text-accent-400" /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              className="btn-primary w-full"
              onClick={handleCloseAll}
            >
              I have stored this API key securely
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="field-label" htmlFor="key-name">
              Key Name / Description
            </label>
            <input
              id="key-name"
              type="text"
              className="input text-xs"
              placeholder="e.g. Production Backend, Zapier Sync, Mobile App"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              autoFocus
            />
          </div>

          {/* Environment selection */}
          <div>
            <span className="field-label">Environment</span>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors ${
                  formData.environment === 'live'
                    ? 'border-accent-400/50 bg-accent-400/5 text-paper-100'
                    : 'border-ink-700 bg-ink-950 text-paper-400 hover:border-ink-600'
                }`}
              >
                <div>
                  <div className="font-semibold text-xs text-paper-100">Live Key</div>
                  <div className="text-[10px] text-paper-500">Prefixed with lnk_live_</div>
                </div>
                <input
                  type="radio"
                  name="environment"
                  value="live"
                  checked={formData.environment === 'live'}
                  onChange={() => setFormData({ ...formData, environment: 'live' })}
                  className="accent-accent-400"
                />
              </label>

              <label
                className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors ${
                  formData.environment === 'test'
                    ? 'border-amber-400/50 bg-amber-400/5 text-paper-100'
                    : 'border-ink-700 bg-ink-950 text-paper-400 hover:border-ink-600'
                }`}
              >
                <div>
                  <div className="font-semibold text-xs text-paper-100">Test / Sandbox</div>
                  <div className="text-[10px] text-paper-500">Prefixed with lnk_test_</div>
                </div>
                <input
                  type="radio"
                  name="environment"
                  value="test"
                  checked={formData.environment === 'test'}
                  onChange={() => setFormData({ ...formData, environment: 'test' })}
                  className="accent-amber-400"
                />
              </label>
            </div>
          </div>

          {/* Scopes selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="field-label mb-0">Permissions &amp; Scopes</span>
              <button
                type="button"
                onClick={toggleAllScopes}
                className="text-[11px] font-medium text-accent-400 hover:underline"
              >
                {formData.scopes.length === SCOPES_CONFIG.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
              {SCOPES_CONFIG.map((s) => {
                const checked = formData.scopes.includes(s.value);
                return (
                  <label
                    key={s.value}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-xs transition-colors ${
                      checked
                        ? 'border-accent-400/30 bg-accent-400/5 text-paper-100'
                        : 'border-ink-700 bg-ink-950 text-paper-400 hover:border-ink-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleScope(s.value)}
                      className="mt-0.5 h-3.5 w-3.5 accent-accent-400 rounded"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[11px] font-semibold text-paper-200">
                        {s.label}
                      </div>
                      <div className="text-[10px] text-paper-500 leading-tight">
                        {s.desc}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Expiration selection */}
          <div>
            <label className="field-label" htmlFor="key-expiry">
              Expiration
            </label>
            <select
              id="key-expiry"
              className="input text-xs"
              value={formData.expiresInDays}
              onChange={(e) => setFormData({ ...formData, expiresInDays: e.target.value })}
            >
              <option value="0">Never (Does not expire)</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year (365 days)</option>
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <RotateCw size={14} className="animate-spin" />
                  <span>Generating…</span>
                </>
              ) : (
                'Generate Key'
              )}
            </button>
            <button type="button" className="btn-secondary" onClick={handleCloseAll}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default CreateApiKeyModal;
