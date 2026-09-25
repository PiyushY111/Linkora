import { useState } from 'react';
import toast from 'react-hot-toast';
import { linkService } from '../../../services';
import useLinkStore from '../../../context/linkStore';
import { useConfirm } from '../../../context/ConfirmContext';

/** Copy, pause/activate, delete and save for the link shown in the drawer. */
export default function useLinkActions(link, onClose) {
  const confirm = useConfirm();
  const { updateLink, removeLink } = useLinkStore();
  const [copied, setCopied] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(link.shortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Copied to clipboard');
  };

  const handleToggle = async () => {
    setIsUpdating(true);
    try {
      const data = await linkService.toggleLinkStatus(link._id);
      updateLink(data.link);
      toast.success(data.link.isActive ? 'Link activated' : 'Link paused');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update link status');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Delete Short Link',
      message: 'Are you sure you want to delete this short link? The redirect URL will stop working immediately and all analytics data will be permanently deleted.',
      confirmText: 'Delete Link',
      cancelText: 'Cancel',
      variant: 'danger',
      detail: `${link.shortUrl} ➔ ${link.originalUrl}`,
    });
    if (!confirmed) return;

    setIsUpdating(true);
    try {
      await linkService.deleteLink(link._id);
      removeLink(link._id);
      toast.success('Link deleted');
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete link');
    } finally {
      setIsUpdating(false);
    }
  };

  /** Sends the update; calls onSaved only if it succeeded. */
  const saveChanges = async (payload, onSaved) => {
    setIsUpdating(true);
    try {
      const updated = await linkService.updateLink(link._id, payload);
      updateLink(updated.link);
      onSaved();
      toast.success('Link updated successfully');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update link');
    } finally {
      setIsUpdating(false);
    }
  };

  const downloadQr = () => {
    if (!link.qrCode) return;
    const a = document.createElement('a');
    a.href = link.qrCode;
    a.download = `${link.shortCode}-qr.png`;
    a.click();
  };

  return { copied, isUpdating, handleCopy, handleToggle, handleDelete, saveChanges, downloadQr };
}
