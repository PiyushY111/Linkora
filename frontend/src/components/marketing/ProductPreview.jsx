import { useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, BarChart3, Check, ChevronDown,
  HelpCircle, Globe2, LayoutDashboard, Link2, MousePointer2, Plus,
  QrCode, Settings2, Users,
} from 'lucide-react';
import QRCodeViewer from '../qr/QRCodeViewer';
import { getHostedDomain, getHostedOrigin } from '../../utils/domain';

const PREVIEW_TABS = [
  { id: 'links', label: 'Short links', icon: Link2 },
  { id: 'analytics', label: 'Click analytics', icon: BarChart3 },
  { id: 'qr', label: 'QR codes', icon: QrCode },
];

const QR_CONFIG = {
  dotsType: 'rounded', dotsColor: '#192013', bgColor: '#e4f5c4',
  cornersSquareType: 'extra-rounded', cornersDotType: 'dot',
};

export function DemoQR({ size = 136 }) {
  return <QRCodeViewer data={getHostedOrigin()} config={QR_CONFIG} size={size} showFrame={false} />;
}

export function PerformanceChart({ compact = false }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={`performance-chart${compact ? ' performance-chart--compact' : ''}`} viewBox="0 0 600 160" preserveAspectRatio="none" role="img" aria-label="Illustrative chart showing clicks increasing over time">
      <defs>
        <linearGradient id={`chart-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c5f277" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#c5f277" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[30, 70, 110, 150].map((y) => <path key={y} d={`M0 ${y}H600`} stroke="currentColor" strokeDasharray="3 5" />)}
      <path d="M0 135 C15 135 20 117 35 122 S60 141 78 120 S98 129 115 108 S138 111 155 102 S176 128 195 99 S223 116 243 89 S272 107 295 78 S313 92 335 70 S355 83 380 51 S400 64 420 45 S445 67 465 39 S491 44 510 30 S534 54 550 27 S578 31 600 9 V160 H0 Z" fill={`url(#chart-${id})`} />
      <path d="M0 135 C15 135 20 117 35 122 S60 141 78 120 S98 129 115 108 S138 111 155 102 S176 128 195 99 S223 116 243 89 S272 107 295 78 S313 92 335 70 S355 83 380 51 S400 64 420 45 S445 67 465 39 S491 44 510 30 S534 54 550 27 S578 31 600 9" fill="none" stroke="#c5f277" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function MiniBars() {
  return (
    <div className="mini-bars" aria-hidden="true">
      {[22, 35, 27, 48, 38, 57, 43, 68, 55, 76, 63, 89, 72, 97, 83, 100].map((height, i) => (
        <span key={i} style={{ height: `${height}%`, opacity: 0.25 + i * 0.05 }} />
      ))}
    </div>
  );
}

export default function ProductPreview() {
  const [activeTab, setActiveTab] = useState('links');
  const tabRefs = useRef([]);
  const hostedDomain = getHostedDomain();
  const sampleLinks = [
    { name: 'Summer collection', slug: 'summer', clicks: '12,846', icon: ArrowUpRight, color: 'lime' },
    { name: 'The weekly edit', slug: 'newsletter', clicks: '8,392', icon: ArrowRight, color: 'purple' },
    { name: 'Something worth sharing', slug: 'discover', clicks: '3,610', icon: ArrowDownLeft, color: 'orange' },
  ];

  const onTabKeyDown = (event, index) => {
    let nextIndex;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % PREVIEW_TABS.length;
    if (event.key === 'ArrowLeft') nextIndex = (index + PREVIEW_TABS.length - 1) % PREVIEW_TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = PREVIEW_TABS.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    setActiveTab(PREVIEW_TABS[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="product-showcase" id="platform">
      <div className="preview-tabs" role="tablist" aria-label="Explore Linkora">
        {PREVIEW_TABS.map(({ id, label, icon: Icon }, index) => (
          <button
            key={id} ref={(node) => { tabRefs.current[index] = node; }}
            id={`preview-tab-${id}`} type="button" role="tab" aria-selected={activeTab === id}
            aria-controls="preview-panel" tabIndex={activeTab === id ? 0 : -1}
            className={activeTab === id ? 'is-active' : ''}
            onClick={() => setActiveTab(id)} onKeyDown={(event) => onTabKeyDown(event, index)}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      <div className="product-window">
        <div className="product-window-bar">
          <div className="window-dots" aria-hidden="true"><i /><i /><i /></div>
          <span><span className="window-lock"><Check size={10} /></span> Your Linkora workspace</span>
          <span className="preview-label">PRODUCT PREVIEW</span>
        </div>
        <div className="product-window-body">
          <aside className="preview-sidebar" aria-hidden="true">
            <div className="preview-wordmark"><ArrowUpRight size={19} /> linkora.</div>
            <div className="preview-workspace"><span>S</span> Studio workspace <ChevronDown size={12} /></div>
            <div className="preview-sidebar-label">WORKSPACE</div>
            {[
              [LayoutDashboard, 'Overview', true], [Link2, 'My links'], [BarChart3, 'Analytics'],
              [QrCode, 'QR codes'], [Users, 'Members'],
            ].map(([Icon, label, selected]) => (
              <div key={label} className={`preview-nav-item${selected ? ' is-active' : ''}`}><Icon size={15} /> {label}{label === 'My links' && <span>24</span>}</div>
            ))}
            <div className="preview-sidebar-bottom">
              <div className="preview-nav-item"><HelpCircle size={15} /> Help & resources</div>
              <div className="preview-nav-item"><Settings2 size={15} /> Settings</div>
              <div className="preview-user"><span>JD</span><div>Jamie Davis<small>Personal workspace</small></div></div>
            </div>
          </aside>

          <div className="preview-main" role="tabpanel" id="preview-panel" aria-labelledby={`preview-tab-${activeTab}`} tabIndex={0}>
            <div className="preview-heading">
              <div><p>YOUR WORKSPACE, AT A GLANCE</p><h3>{activeTab === 'qr' ? 'Made to be scanned.' : activeTab === 'analytics' ? 'Every click tells a story.' : 'A good day to make connections.'}</h3></div>
              <Link to="/register" className="preview-create"><Plus size={13} /> Create a link</Link>
            </div>
            <div className="preview-stats">
              {[[MousePointer2, 'Total clicks', '24,848', '+18.6%'], [Link2, 'Active links', '24', '+4 this month'], [Globe2, 'Countries reached', '42', '+8 this month']].map(([Icon, label, value, change]) => (
                <div className="preview-stat" key={label}>
                  <span><Icon size={13} /> {label}</span><div><strong>{value}</strong><small>{change}</small></div>
                </div>
              ))}
            </div>

            {activeTab === 'links' && (
              <div className="preview-links">
                <div className="preview-section-heading"><h4>Your links</h4><span>Example data <span className="tiny-dot" /></span></div>
                <div className="preview-table-head"><span>LINK NAME</span><span>CLICKS</span><span>STATUS</span></div>
                {sampleLinks.map(({ name, slug, clicks, icon: Icon, color }) => (
                  <div className="preview-link-row" key={slug}>
                    <div><span className={`preview-link-icon ${color}`}><Icon size={17} /></span><span><strong>{name}</strong><small>{hostedDomain}/{slug}</small></span></div>
                    <span className="preview-clicks">{clicks}<MiniBars /></span><span className="preview-active"><i /> Active</span>
                  </div>
                ))}
              </div>
            )}
            {activeTab === 'analytics' && (
              <div className="preview-analytics">
                <div className="preview-section-heading"><h4>Click activity</h4><span>Last 30 days · Example data</span></div>
                <PerformanceChart />
                <div className="chart-axis"><span>Jun 1</span><span>Jun 8</span><span>Jun 15</span><span>Jun 22</span><span>Jun 30</span></div>
              </div>
            )}
            {activeTab === 'qr' && (
              <div className="preview-qr">
                <div className="preview-qr-code"><DemoQR /><span>SCAN. CONNECT. REPEAT.</span></div>
                <div><span className="marketing-eyebrow">OFFLINE MEETS ONLINE</span><h4>Your next connection<br />is one scan away.</h4><p>Give every link a QR code that looks like you. Scan this one to visit Linkora.</p><Link to="/register">Create your QR code <ArrowRight size={14} /></Link></div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="preview-caption"><span className="tiny-dot" /> One workspace. Every connection.</div>
    </div>
  );
}
