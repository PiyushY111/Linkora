import { DEFAULT_QR_CONFIG } from './qrPresets';

/**
 * Starting QR style for new codes in the active workspace: the built-in
 * default with the workspace's saved style (activeWorkspace.settings.
 * defaultQrStyle, which may be partial) layered on top. Nested gradient and
 * frame objects are merged too, so a partial override keeps the rest.
 * @param {{ settings?: { defaultQrStyle?: object | null } } | null | undefined} activeWorkspace
 */
export function workspaceQrDefault(activeWorkspace) {
  const saved = activeWorkspace?.settings?.defaultQrStyle;
  if (!saved) return DEFAULT_QR_CONFIG;
  return {
    ...DEFAULT_QR_CONFIG,
    ...saved,
    gradient: { ...DEFAULT_QR_CONFIG.gradient, ...(saved.gradient || {}) },
    frame: { ...DEFAULT_QR_CONFIG.frame, ...(saved.frame || {}) },
  };
}

/**
 * UTM fields to pre-fill in the create-link form. Per field, the workspace
 * default wins (it's the team's convention for this workspace), then the
 * user's own default from Settings, then empty. Always editable per link.
 * @param {{ settings?: { defaultUtmParams?: object | null } } | null | undefined} activeWorkspace
 * @param {{ defaultUtm?: { source?: string, medium?: string, campaign?: string } } | null | undefined} user
 */
export function workspaceUtmDefaults(activeWorkspace, user) {
  const team = activeWorkspace?.settings?.defaultUtmParams || {};
  const mine = user?.defaultUtm || {};
  return {
    utmSource: team.source || mine.source || '',
    utmMedium: team.medium || mine.medium || '',
    utmCampaign: team.campaign || mine.campaign || '',
    utmTerm: team.term || '',
    utmContent: team.content || '',
  };
}
