import { useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../../components/ui/Modal';
import { webhookService } from '../../services';
import EventCheckboxGrid from './EventCheckboxGrid';

/** Edits an endpoint's URL, description and events. `editWebhook` is a working copy. */
export default function EditWebhookModal({ editWebhook, setEditWebhook, onClose, onSaved }) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editWebhook) return;
    if (editWebhook.events.length === 0) {
      toast.error('Select at least one event');
      return;
    }

    setIsUpdating(true);
    try {
      await webhookService.update(editWebhook._id, {
        url: editWebhook.url,
        description: editWebhook.description,
        events: editWebhook.events,
        isActive: editWebhook.isActive,
      });

      onClose();
      toast.success('Webhook updated');
      onSaved();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update webhook');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Modal
      open={Boolean(editWebhook)}
      onClose={onClose}
      title="Edit Webhook Endpoint"
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleUpdate} className="space-y-4">
        <div>
          <label className="field-label" htmlFor="edit-url">
            Endpoint URL
          </label>
          <input
            id="edit-url"
            type="url"
            className="input-mono text-xs"
            value={editWebhook.url}
            onChange={(e) =>
              setEditWebhook({ ...editWebhook, url: e.target.value })
            }
            required
          />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-paper-500">Quick fill:</span>
            <button
              type="button"
              onClick={() =>
                setEditWebhook({
                  ...editWebhook,
                  url: 'http://127.0.0.1:5001/api/webhooks/debug/echo',
                })
              }
              className="text-accent-400 hover:underline font-mono bg-accent-400/10 px-2 py-0.5 rounded border border-accent-400/20"
            >
              Use Built-in Echo Endpoint
            </button>
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="edit-desc">
            Description
          </label>
          <input
            id="edit-desc"
            type="text"
            className="input text-xs"
            value={editWebhook.description || ''}
            onChange={(e) =>
              setEditWebhook({ ...editWebhook, description: e.target.value })
            }
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="field-label mb-0">Events</span>
          </div>
          <EventCheckboxGrid
            isChecked={(value) => editWebhook.events?.includes(value)}
            onToggle={(value) => {
              const next = editWebhook.events?.includes(value)
                ? editWebhook.events.filter((e) => e !== value)
                : [...editWebhook.events, value];
              setEditWebhook({ ...editWebhook, events: next });
            }}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="btn-primary flex-1"
            disabled={isUpdating}
          >
            {isUpdating ? 'Saving…' : 'Save Changes'}
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
