import crypto from 'crypto';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import Workspace from '../models/Workspace.js';
import { ConflictError } from '../lib/errors.js';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * SHA-256 of an invite token: what's stored and looked up, never the token.
 * @param {string} token
 */
export function hashInviteToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * A fresh invite token (32 random bytes, hex, the same crypto.randomBytes
 * style as refresh tokens and API keys) plus its hash and expiry.
 */
export function generateInvite(now = Date.now()) {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, tokenHash: hashInviteToken(token), expiresAt: new Date(now + INVITE_TTL_MS) };
}

export function inviteUrl(token) {
  return `${env.FRONTEND_URL}/invite/${token}`;
}

/**
 * Delivery hook for invite emails.
 *
 * TODO(mail-provider): there's no email provider in this codebase yet, so
 * invites are shared by copying the link the create endpoint returns. To
 * send them automatically, implement delivery here (SES, Postmark, Resend,
 * SMTP, ...) behind its own env config, and return { delivered: true } on
 * success. Callers already pass everything a template needs.
 *
 * Never log `url`: it carries the invite token.
 * @param {{ to: string, url: string, workspaceName: string, inviterName: string, role: string, inviteId: string }} invite
 * @returns {Promise<{ delivered: boolean }>}
 */
export async function deliverInviteEmail({ inviteId }) {
  logger.debug({ inviteId }, 'No mail provider configured; invite link must be shared manually');
  return { delivered: false };
}

/**
 * Creates the pending invite for `email`, or, if one exists, refreshes it
 * in place with a new token and expiry (the resend). Expired invites are
 * dropped on the way. Two conditional updates rather than read-modify-write,
 * so concurrent invites to one email can't produce two entries. Callers
 * validate the role and apply the grant rule first.
 * @param {unknown} workspaceId
 * @param {{ email: string, role: string, invitedBy: unknown }} invite
 * @returns {Promise<{ invite: object, token: string, resent: boolean }>} token: the raw token, for the link (never stored)
 */
export async function upsertPendingInvite(workspaceId, { email, role, invitedBy }) {
  const { token, tokenHash, expiresAt } = generateInvite();
  const fields = { role, tokenHash, invitedBy, createdAt: new Date(), expiresAt };

  await Workspace.updateOne({ _id: workspaceId }, { $pull: { pendingInvites: { expiresAt: { $lte: new Date() } } } });
  const refreshed = await Workspace.updateOne(
    { _id: workspaceId, 'pendingInvites.email': email },
    { $set: Object.fromEntries(Object.entries(fields).map(([k, v]) => [`pendingInvites.$.${k}`, v])) }
  );
  const resent = refreshed.matchedCount > 0;
  if (!resent) {
    const added = await Workspace.updateOne(
      { _id: workspaceId, 'pendingInvites.email': { $ne: email } },
      { $push: { pendingInvites: { email, ...fields } } }
    );
    if (added.matchedCount === 0) throw new ConflictError('An invite for this email was just created; try again');
  }

  const stored = await Workspace.findOne({ _id: workspaceId }, { pendingInvites: { $elemMatch: { tokenHash } } }).lean();
  return { invite: stored.pendingInvites[0], token, resent };
}

export default { INVITE_TTL_MS, hashInviteToken, generateInvite, inviteUrl, deliverInviteEmail, upsertPendingInvite };
