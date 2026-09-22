import { useState } from 'react';
import toast from 'react-hot-toast';
import Modal from './ui/Modal';
import { linkService } from '../services';
import useLinkStore from '../context/linkStore';

const EMPTY_FORM = { originalUrl: '', customAlias: '', title: '', description: '', tags: '' };

const CreateLinkModal = ({ open, onClose }) => {
  const { links, setLinks } = useLinkStore();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const handleClose = () => {
    setFormData(EMPTY_FORM);
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.originalUrl) {
      toast.error('Enter a URL');
      return;
    }

    setIsLoading(true);
    try {
      let normalizedUrl = formData.originalUrl.trim();
      if (!/^https?:\/\//i.test(normalizedUrl)) {
        normalizedUrl = `https://${normalizedUrl}`;
      }

      const payload = {
        originalUrl: normalizedUrl,
        tags: formData.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      };
      if (formData.customAlias.trim()) payload.customAlias = formData.customAlias.trim();
      if (formData.title.trim()) payload.title = formData.title.trim();
      if (formData.description.trim()) payload.description = formData.description.trim();

      const result = await linkService.createLink(payload);
      setLinks([result.link, ...links]);
      toast.success('Link created');
      handleClose();
    } catch (error) {
      toast.error(
        error.response?.data?.message || error.response?.data?.errors?.[0]?.msg || 'Failed to create link'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Create short link">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="field-label" htmlFor="originalUrl">Destination URL</label>
          <input
            id="originalUrl"
            type="text"
            className="input"
            placeholder="https://example.com/very/long/path"
            value={formData.originalUrl}
            onChange={(e) => setFormData({ ...formData, originalUrl: e.target.value })}
            required
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="customAlias">Custom alias</label>
            <input
              id="customAlias"
              type="text"
              className="input-mono"
              placeholder="my-link"
              value={formData.customAlias}
              onChange={(e) => setFormData({ ...formData, customAlias: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="title">Title</label>
            <input
              id="title"
              type="text"
              className="input"
              placeholder="Campaign launch"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="description">Description</label>
          <textarea
            id="description"
            className="input"
            rows="2"
            placeholder="Optional"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="tags">Tags</label>
          <input
            id="tags"
            type="text"
            className="input"
            placeholder="marketing, launch"
            value={formData.tags}
            onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button type="submit" className="btn-primary flex-1" disabled={isLoading}>
            {isLoading ? 'Creating…' : 'Create link'}
          </button>
          <button type="button" className="btn-secondary" onClick={handleClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default CreateLinkModal;
