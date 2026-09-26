import { Link2, BarChart3, QrCode, Contact, Webhook, Terminal, Building2, Settings } from 'lucide-react';

// Shared by the desktop sidebar and the mobile slide-over so the two can't drift.
export const NAV_ITEMS = [
  { to: '/dashboard', label: 'Links', icon: Link2 },
  { to: '/qr-codes', label: 'QR Studio', icon: QrCode },
  { to: '/bio', label: 'Bio Page', icon: Contact, permission: 'links:read' },
  { to: '/analytics/all', label: 'Analytics', icon: BarChart3 },
  { to: '/webhooks', label: 'Webhooks', icon: Webhook, permission: 'webhooks:manage' },
  { to: '/developer', label: 'Developer', icon: Terminal, permission: 'apiKeys:manage' },
  { to: '/workspaces', label: 'Workspaces', icon: Building2 },
  { to: '/settings', label: 'Settings', icon: Settings },
];
