import { useState, useEffect } from 'react';
import { BarChart3, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link as RouterLink } from 'react-router-dom';
import QRCodeModal from '../../qr/QRCodeModal';
import useLinkEditForm from './useLinkEditForm';
import useLinkActions from './useLinkActions';
import { buildLinkUpdatePayload, isQuotaFull, isLinkExpired } from './linkDrawerHelpers';
import LinkDrawerHeader from './LinkDrawerHeader';
import LinkOverview from './LinkOverview';
import PerformanceCard from './PerformanceCard';
import QrAssetCard from './QrAssetCard';
import { AbTestSummary, SocialPreviewSummary } from './LinkSummaryCards';
import LinkDetailsView from './LinkDetailsView';
import LinkEditForm from './LinkEditForm';

export default function LinkDrawer({ link, open, onClose }) {
  const edit = useLinkEditForm(link);
  const actions = useLinkActions(link, onClose);
  const [showQrModal, setShowQrModal] = useState(false);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!link) return null;

  const { isEditing, setIsEditing } = edit;

  const handleSaveEdit = (e) => {
    e.preventDefault();
    actions.saveChanges(buildLinkUpdatePayload(link, edit.form), edit.finishSave);
  };

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
              <LinkDrawerHeader
                link={link}
                isUpdating={actions.isUpdating}
                onToggle={actions.handleToggle}
                onClose={onClose}
              />

              {/* Drawer Content Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                <LinkOverview
                  link={link}
                  copied={actions.copied}
                  onCopy={actions.handleCopy}
                  isEditing={isEditing}
                  originalUrl={edit.form.originalUrl}
                  onOriginalUrlChange={(value) => edit.setField('originalUrl', value)}
                />

                {/* Performance Metrics Card */}
                <PerformanceCard link={link} />

                {/* QR Code Section */}
                <QrAssetCard link={link} onCustomize={() => setShowQrModal(true)} onDownload={actions.downloadQr} />

                {link.routingType === 'ab_test' && Array.isArray(link.variants) && link.variants.length > 0 && (
                  <AbTestSummary link={link} />
                )}

                {(link.ogTitle || link.ogImage || link.ogDescription) && <SocialPreviewSummary link={link} />}

                {/* Metadata, Security & Routing Options */}
                <div className="panel p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-paper-400">
                      Settings, Security & Routing
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsEditing(!isEditing)}
                      className="text-xs text-accent-400 hover:underline font-medium"
                    >
                      {isEditing ? 'Cancel' : 'Edit Details'}
                    </button>
                  </div>

                  {isEditing ? (
                    <LinkEditForm link={link} edit={edit} isUpdating={actions.isUpdating} onSubmit={handleSaveEdit} />
                  ) : (
                    <LinkDetailsView link={link} isQuotaFull={isQuotaFull(link)} isExpired={isLinkExpired(link)} />
                  )}
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="border-t border-ink-700 p-4 bg-ink-950 flex items-center justify-between gap-2">
                <button type="button" onClick={actions.handleDelete} disabled={actions.isUpdating} className="btn-danger btn-sm">
                  <Trash2 size={13} />
                  <span>Delete</span>
                </button>
                <RouterLink to={`/analytics/${link._id}`} className="btn-primary btn-sm flex items-center gap-1.5">
                  <BarChart3 size={13} />
                  <span>Open Analytics</span>
                </RouterLink>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>

    <QRCodeModal open={showQrModal} onClose={() => setShowQrModal(false)} link={link} />
  </>
  );
}
