import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import Modal from '../ui/Modal';
import QRCodeModal from '../qr/QRCodeModal';
import useCreateLinkForm from './useCreateLinkForm';
import { TABS } from './constants';
import CreateLinkTabs from './CreateLinkTabs';
import CreateLinkSuccess from './CreateLinkSuccess';
import GeneralTab from './GeneralTab';
import UtmTab from './UtmTab';
import SecurityTab from './SecurityTab';
import TargetingTab from './TargetingTab';
import QrDesignTab from './QrDesignTab';
import AbTestTab from './AbTestTab';
import SocialPreviewTab from './SocialPreviewTab';

const footerLabelFor = (tabId) => TABS.find((t) => t.id === tabId)?.footerLabel ?? 'Security & Access';

export default function CreateLinkModal({ open, onClose }) {
  const form = useCreateLinkForm({ open, onClose });
  const { activeTab, formData, createdResult, actions } = form;
  const [showQrModal, setShowQrModal] = useState(false);
  const [lightBackdrop, setLightBackdrop] = useState(false);

  const tabProps = {
    formData,
    domain: form.domain,
    computedDestinationUrl: form.computedDestinationUrl,
    actions,
  };

  return (
    <>
      <Modal
        open={open}
        onClose={form.handleClose}
        title={createdResult ? 'Link Created Successfully' : 'Create Enterprise Link'}
        maxWidth="max-w-4xl"
      >
      <AnimatePresence mode="wait">
        {createdResult ? (
          /* Success Screen */
          <CreateLinkSuccess
            createdResult={createdResult}
            formQrConfig={formData.qrConfig}
            copied={form.copied}
            successQrViewerRef={form.successQrViewerRef}
            onCopy={form.copyShortUrl}
            onCustomizeQr={() => setShowQrModal(true)}
            onDownloadQr={form.downloadQr}
            onCreateAnother={form.startOver}
            onDone={form.handleClose}
          />
        ) : (
          /* Main Creation Form */
          <form onSubmit={form.handleSubmit} className="space-y-5">
            <CreateLinkTabs activeTab={activeTab} onChange={form.setActiveTab} formData={formData} />

            {activeTab === 'general' && <GeneralTab {...tabProps} />}
            {activeTab === 'utm' && <UtmTab {...tabProps} />}
            {activeTab === 'enterprise' && (
              <SecurityTab {...tabProps} showPassword={form.showPassword} setShowPassword={form.setShowPassword} />
            )}
            {activeTab === 'targeting' && <TargetingTab {...tabProps} />}
            {activeTab === 'qr' && (
              <QrDesignTab
                {...tabProps}
                lightBackdrop={lightBackdrop}
                onToggleBackdrop={() => setLightBackdrop(!lightBackdrop)}
                qrViewerRef={form.qrViewerRef}
              />
            )}
            {activeTab === 'ab_test' && <AbTestTab {...tabProps} />}
            {activeTab === 'opengraph' && <SocialPreviewTab {...tabProps} />}

            {/* Actions */}
            <div className="sticky bottom-0 z-10 flex items-center justify-between border-t border-ink-700 pt-3.5 pb-1 mt-4 bg-ink-900/95 backdrop-blur-sm shrink-0">
              <span className="text-xs text-paper-500">{footerLabelFor(activeTab)}</span>
              <div className="flex gap-2">
                <button type="button" onClick={form.handleClose} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={form.isLoading} className="btn-primary">
                  {form.isLoading ? 'Creating…' : 'Create link'}
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
      onSaveSuccess={(updated) => form.setCreatedResult(updated)}
    />
  </>
  );
}
