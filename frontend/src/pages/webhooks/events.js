export const ALL_EVENTS = [
  {
    value: 'link.clicked',
    label: 'link.clicked',
    description: 'Triggered whenever a link redirect occurs with device/geo data.',
  },
  {
    value: 'link.created',
    label: 'link.created',
    description: 'Triggered when a new short link is provisioned.',
  },
  {
    value: 'link.updated',
    label: 'link.updated',
    description: 'Triggered when link destination, tags, or settings are altered.',
  },
  {
    value: 'link.deleted',
    label: 'link.deleted',
    description: 'Triggered when a link is removed from the system.',
  },
  {
    value: 'link.limit_reached',
    label: 'link.limit_reached',
    description: 'Triggered when link exceeds max clicks or unique visitor cap.',
  },
  {
    value: 'link.expired',
    label: 'link.expired',
    description: 'Triggered when a link passes its expiration date.',
  },
  {
    value: 'security.abuse_flagged',
    label: 'security.abuse_flagged',
    description: 'Triggered when phishing, malware, or spam threat is flagged.',
  },
  {
    value: 'endpoint.test',
    label: 'endpoint.test',
    description: 'Synthetic verification pings sent via test runner.',
  },
];

/** Pre-selected when registering a new endpoint. */
export const DEFAULT_CREATE_EVENTS = ['link.clicked', 'link.created', 'link.limit_reached'];
