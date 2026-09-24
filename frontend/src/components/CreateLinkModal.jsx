import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Modal from './ui/Modal';
import QRCodeModal from './qr/QRCodeModal';
import { linkService } from '../services';
import useLinkStore from '../context/linkStore';
import useAuthStore from '../context/authStore';
import { EMPTY_FORM } from './createLink/constants';
import useCreateLinkForm from './createLink/useCreateLinkForm';
import buildLinkPayload from './createLink/buildLinkPayload';
import CreateLinkTabBar, { footerLabelFor } from './createLink/CreateLinkTabBar';
import CreateLinkSuccess from './createLink/CreateLinkSuccess';
import GeneralTab from './createLink/tabs/GeneralTab';
import UtmTab from './createLink/tabs/UtmTab';
import SecurityTab from './createLink/tabs/SecurityTab';
import TargetingTab from './createLink/tabs/TargetingTab';
import QrDesignTab from './createLink/tabs/QrDesignTab';
import AbTestTab from './createLink/tabs/AbTestTab';
import OpenGraphTab from './createLink/tabs/OpenGraphTab';

export default function CreateLinkModal({ open, onClose }) {
  const { addLink } = useLinkStore();
  const { user } = useAuthStore();
  const form = useCreateLinkForm();
  const { formData, setFormData, computedDestinationUrl } = form;
  const [activeTab, setActiveTab] = useState('general');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [createdResult, setCreatedResult] = useState(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [lightBackdrop, setLightBackdrop] = useState(false);
  const qrViewerRef = useRef(null);

  // Pre-fill user's default category and UTM parameters when opening modal
  useEffect(() => {
    if (open) {
      setFormData({
        ...EMPTY_FORM,
        category: user?.defaultLinkCategory || 'marketing',
        utmSource: user?.defaultUtm?.source || '',
        utmMedium: user?.defaultUtm?.medium || '',
        utmCampaign: user?.defaultUtm?.campaign || '',
      });
      setCreatedResult(null);
      setActiveTab('general');
    }
  }, [open, user, setFormData]);

  const handleClose = () => {
    setFormData(EMPTY_FORM);
    setCreatedResult(null);
    setActiveTab('general');
    setShowPassword(false);
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.originalUrl.trim()) {
      toast.error('Destination URL is required');
      return;
    }

    if (formData.enablePassword && !formData.password.trim()) {
      toast.error('Please enter a password for protection');
      return;
    }

    setIsLoading(true);
    try {
      // If live preview is active, capture styled dataUrl for backend storage
      let styledQrDataUrl = null;
      if (qrViewerRef.current) {
        try {
          styledQrDataUrl = await qrViewerRef.current.getDataUrl(512);
        } catch {}
      }

      const { payload, error } = buildLinkPayload(formData, computedDestinationUrl, styledQrDataUrl);
      if (error) {
        toast.error(error);
        return;
      }

      const result = await linkService.createLink(payload);
      addLink(result.link);
      setCreatedResult(result.link);
      toast.success('Link created successfully!');
    } catch (error) {
      toast.error(
        error.response?.data?.message || error.response?.data?.errors?.[0]?.msg || 'Failed to create link'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const tabProps = { formData, setFormData };

  return (
    <>
      <Modal
        open={open}
        onClose={handleClose}
        title={createdResult ? 'Link Created Successfully' : 'Create Enterprise Link'}
        maxWidth="max-w-4xl"
      >
      <AnimatePresence mode="wait">
        {createdResult ? (
          /* Success Screen */
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6 pt-1"
          >
            <CreateLinkSuccess
              createdResult={createdResult}
              fallbackQrConfig={formData.qrConfig}
              onCustomizeQr={() => setShowQrModal(true)}
              onCreateAnother={() => {
                setFormData(EMPTY_FORM);
                setCreatedResult(null);
                setActiveTab('general');
              }}
              onDone={handleClose}
            />
          </motion.div>
        ) : (
          /* Main Creation Form */
          <form onSubmit={handleSubmit} className="space-y-5">
            <CreateLinkTabBar activeTab={activeTab} onSelect={setActiveTab} formData={formData} />

            {activeTab === 'general' && (
              <GeneralTab
                {...tabProps}
                domain={form.domain}
                generateRandomAlias={form.generateRandomAlias}
                handleAddTag={form.handleAddTag}
                removeTag={form.removeTag}
              />
            )}
            {activeTab === 'utm' && (
              <UtmTab {...tabProps} applyUtmPreset={form.applyUtmPreset} computedDestinationUrl={computedDestinationUrl} />
            )}
            {activeTab === 'enterprise' && (
              <SecurityTab {...tabProps} showPassword={showPassword} setShowPassword={setShowPassword} />
            )}
            {activeTab === 'targeting' && <TargetingTab {...tabProps} />}
            {activeTab === 'qr' && (
              <QrDesignTab
                {...tabProps}
                computedDestinationUrl={computedDestinationUrl}
                qrViewerRef={qrViewerRef}
                lightBackdrop={lightBackdrop}
                setLightBackdrop={setLightBackdrop}
              />
            )}
            {activeTab === 'ab_test' && <AbTestTab {...tabProps} />}
            {activeTab === 'opengraph' && <OpenGraphTab {...tabProps} domain={form.domain} />}

            {/* Actions */}
            <div className="sticky bottom-0 z-10 flex items-center justify-between border-t border-ink-700 pt-3.5 pb-1 mt-4 bg-ink-900/95 backdrop-blur-sm shrink-0">
              <span className="text-xs text-paper-500">{footerLabelFor(activeTab)}</span>
              <div className="flex gap-2">
                <button type="button" onClick={handleClose} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={isLoading} className="btn-primary">
                  {isLoading ? 'Creating…' : 'Create link'}
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </form>
        )}
      </AnimatePresence>
    </Modal>

    <QRCodeModal
      open={showQrModal}
      onClose={() => setShowQrModal(false)}
      link={createdResult}
      onSaveSuccess={(updated) => setCreatedResult(updated)}
    />
  </>
  );
}
