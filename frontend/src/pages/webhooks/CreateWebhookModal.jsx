import { useState } from 'react';
import toast from 'react-hot-toast';
import { RotateCw } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import { webhookService } from '../../services';
import { ALL_EVENTS, DEFAULT_CREATE_EVENTS } from './events';
import EventCheckboxGrid from './EventCheckboxGrid';

/**
 * Registers a webhook endpoint. Stays mounted while closed, so a
 * half-filled form survives closing and reopening; it resets after a
 * successful create. `onCreated(secret)` receives the one-time secret.
 */
export default function CreateWebhookModal({ open, onClose, onCreated }) {
  const [isCreating, setIsCreating] = useState(false);
  const [createData, setCreateData] = useState({
    url: '',
    description: '',
    events: DEFAULT_CREATE_EVENTS,
  });

  const toggleEventInCreate = (evt) => {
    setCreateData((prev) => ({
      ...prev,
      events: prev.events.includes(evt)
        ? prev.events.filter((e) => e !== evt)
        : [...prev.events, evt],
    }));
  };

  const toggleAllEventsInCreate = () => {
    if (createData.events.length === ALL_EVENTS.length) {
      setCreateData((prev) => ({ ...prev, events: [] }));
    } else {
      setCreateData((prev) => ({
        ...prev,
        events: ALL_EVENTS.map((e) => e.value),
      }));
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (createData.events.length === 0) {
      toast.error('Select at least one event');
      return;
    }

    setIsCreating(true);
    try {
      const data = await webhookService.create({
        url: createData.url,
        description: createData.description,
        events: createData.events,
      });

      onClose();
      setCreateData({
        url: '',
        description: '',
        events: DEFAULT_CREATE_EVENTS,
      });
      onCreated(data.webhook.secret);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create webhook');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal
      open={showCreate}
      onClose={onClose}
      title="Register New Webhook Endpoint"
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleCreate} className="space-y-4">
        <div>
          <label className="field-label" htmlFor="create-url">
            Endpoint URL (HTTPS)
          </label>
          <input
            id="create-url"
            type="url"
            className="input-mono text-xs"
            placeholder="https://api.yourdomain.com/v1/webhooks/linkora"
            value={createData.url}
            onChange={(e) =>
              setCreateData({ ...createData, url: e.target.value })
            }
            required
            autoFocus
          />
          <p className="mt-1 text-[11px] text-paper-500">
            Must be an accessible URL. Local addresses and cloud metadata services are blocked for SSRF protection.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-paper-500">Quick fill:</span>
            <button
              type="button"
              onClick={() =>
                setCreateData({
                  ...createData,
                  url: 'http://127.0.0.1:5001/api/webhooks/debug/echo',
                  description: createData.description || 'Local Built-in Echo Receiver',
                })
              }
              className="text-accent-400 hover:underline font-mono bg-accent-400/10 px-2 py-0.5 rounded border border-accent-400/20"
            >
              Use Built-in Echo Endpoint
            </button>
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="create-desc">
            Description / Friendly Name (Optional)
          </label>
          <input
            id="create-desc"
            type="text"
            className="input text-xs"
            placeholder="e.g. Production Analytics Ingestion, Zapier Pipeline"
            value={createData.description}
            onChange={(e) =>
              setCreateData({ ...createData, description: e.target.value })
            }
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="field-label mb-0">Events to Receive</span>
            <button
              type="button"
              onClick={toggleAllEventsInCreate}
              className="text-[11px] font-medium text-accent-400 hover:underline"
            >
              {createData.events.length === ALL_EVENTS.length
                ? 'Deselect all'
                : 'Select all'}
            </button>
          </div>

            <EventCheckboxGrid isChecked={(value) => createData.events.includes(value)} onToggle={toggleEventInCreate} />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="btn-primary flex-1"
            disabled={isCreating}
          >
            {isCreating ? (
              <>
                <RotateCw size={14} className="animate-spin" />
                <span>Provisioning…</span>
              </>
            ) : (
              'Create Webhook'
            )}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
