import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import QRCodeModal from '../qr/QRCodeModal';
import { linkService } from '../../services';
import useLinkStore from '../../context/linkStore';
import { useConfirm } from '../../context/ConfirmContext';
import useLinkEditor from './linkDrawer/useLinkEditor';
import DrawerHeader from './linkDrawer/DrawerHeader';
import LinkEndpoints from './linkDrawer/LinkEndpoints';
import PerformanceCard from './linkDrawer/PerformanceCard';
import QrAssetCard from './linkDrawer/QrAssetCard';
import AbSplitCard from './linkDrawer/AbSplitCard';
import SocialPreviewCard from './linkDrawer/SocialPreviewCard';
import LinkSettingsPanel from './linkDrawer/LinkSettingsPanel';
import DrawerFooter from './linkDrawer/DrawerFooter';

export default function LinkDrawer({ link, open, onClose }) {
  const confirm = useConfirm();
  const { updateLink, removeLink } = useLinkStore();
  const [isUpdating, setIsUpdating] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const editor = useLinkEditor({ link, updateLink, setIsUpdating });

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!link) return null;

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

  const isQuotaFull = link.maxClicks && (link.clicks || 0) >= link.maxClicks;
  const isExpired = link.expiryDate && new Date(link.expiryDate) < new Date();

  return (
    <>
      <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="w-screen max-w-md bg-ink-900 border-l border-ink-700 shadow-2xl flex flex-col"
            >
              <DrawerHeader
                link={link}
                isQuotaFull={isQuotaFull}
                isExpired={isExpired}
                isUpdating={isUpdating}
                onToggle={handleToggle}
                onClose={onClose}
              />

              {/* Drawer Content Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                <LinkEndpoints
                  link={link}
                  isEditing={editor.isEditing}
                  originalUrl={editor.originalUrl}
                  setOriginalUrl={editor.setOriginalUrl}
                />
                <PerformanceCard link={link} />
                <QrAssetCard link={link} onCustomize={() => setShowQrModal(true)} />
                <AbSplitCard link={link} />
                <SocialPreviewCard link={link} />
                <LinkSettingsPanel
                  link={link}
                  editor={editor}
                  isUpdating={isUpdating}
                  isQuotaFull={isQuotaFull}
                  isExpired={isExpired}
                />
              </div>

              <DrawerFooter link={link} isUpdating={isUpdating} onDelete={handleDelete} />
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>

    <QRCodeModal
      open={showQrModal}
      onClose={() => setShowQrModal(false)}
      link={link}
    />
  </>
  );
}
