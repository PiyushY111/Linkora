import { Sparkles, Sliders, ShieldCheck, Smartphone, Split, Share2, QrCode } from 'lucide-react';

/**
 * The create-link tabs, in display order. `footerLabel` is what the form
 * footer shows for the active tab; `isConfigured` puts a dot on the tab
 * when that section has non-default values.
 */
export const CREATE_LINK_TABS = [
  { id: 'general', label: 'General Details', footerLabel: 'General', icon: Sparkles },
  {
    id: 'utm',
    label: 'UTM Studio',
    footerLabel: 'Attribution',
    icon: Sliders,
    isConfigured: (f) => f.utmSource || f.utmMedium || f.utmCampaign,
  },
  {
    id: 'enterprise',
    label: 'Security & Access',
    footerLabel: 'Security & Access',
    icon: ShieldCheck,
    isConfigured: (f) => f.enablePassword || f.expiryOption !== 'Never' || f.enableMaxClicks || f.expiredRedirectUrl,
  },
  {
    id: 'targeting',
    label: 'Device Targeting',
    footerLabel: 'Device Targeting',
    icon: Smartphone,
    isConfigured: (f) => f.iosRedirect || f.androidRedirect,
  },
  {
    id: 'ab_test',
    label: 'A/B Split',
    footerLabel: 'A/B Split',
    icon: Split,
    isConfigured: (f) => f.routingType === 'ab_test',
  },
  {
    id: 'opengraph',
    label: 'Social Preview',
    footerLabel: 'Social Preview',
    icon: Share2,
    isConfigured: (f) => f.ogTitle || f.ogImage,
  },
  { id: 'qr', label: 'Custom QR', footerLabel: 'Custom QR', icon: QrCode },
];

export function footerLabelFor(tabId) {
  return CREATE_LINK_TABS.find((t) => t.id === tabId)?.footerLabel ?? 'Security & Access';
}

export default function CreateLinkTabBar({ activeTab, onSelect, formData }) {
  return (
    <div className="flex items-center gap-1 border-b border-ink-700 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-ink-700 scrollbar-track-transparent shrink-0">
      {CREATE_LINK_TABS.map(({ id, label, icon: Icon, isConfigured }) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          className={`flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-semibold shrink-0 whitespace-nowrap transition-colors ${
            activeTab === id
              ? 'border-accent-400 text-accent-400'
              : 'border-transparent text-paper-500 hover:text-paper-300'
          }`}
        >
          <Icon size={14} />
          <span>{label}</span>
          {isConfigured?.(formData) && <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />}
        </button>
      ))}
    </div>
  );
}
