import net from 'net';

/**
 * Organization IP allowlists: exact addresses or CIDR ranges, IPv4 or IPv6.
 * Matching uses Node's built-in net.BlockList, so there's no extra
 * dependency. An empty list means "no restriction".
 */

export const MAX_ALLOWLIST_ENTRIES = 200;

/** "::ffff:1.2.3.4" (IPv4-mapped IPv6, as sockets often report) -> "1.2.3.4". */
export function normalizeIp(ip) {
  const trimmed = String(ip ?? '').trim();
  return trimmed.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');
}

/**
 * Parses one allowlist entry into its canonical form.
 * @param {unknown} entry - "203.0.113.7", "203.0.113.0/24", "2001:db8::/32", ...
 * @returns {{ entry: string, address: string, prefix: number, family: 'ipv4' | 'ipv6' } | null}
 *   null if it isn't a valid IP or CIDR range
 */
export function parseAllowlistEntry(entry) {
  if (typeof entry !== 'string') return null;
  const [rawAddress, rawPrefix, extra] = entry.trim().split('/');
  if (extra !== undefined) return null;

  const address = normalizeIp(rawAddress);
  const version = net.isIP(address);
  if (!version) return null;
  const family = version === 4 ? 'ipv4' : 'ipv6';
  const maxPrefix = version === 4 ? 32 : 128;

  let prefix = maxPrefix;
  if (rawPrefix !== undefined) {
    if (!/^\d{1,3}$/.test(rawPrefix)) return null;
    prefix = Number(rawPrefix);
    if (prefix > maxPrefix) return null;
  }

  return { entry: prefix === maxPrefix ? address : `${address}/${prefix}`, address, prefix, family };
}

/**
 * Validates and canonicalizes a whole list (deduplicated, order kept).
 * @param {unknown} entries
 * @returns {{ valid: string[], invalid: unknown[] }}
 */
export function normalizeAllowlist(entries) {
  if (!Array.isArray(entries)) return { valid: [], invalid: [entries] };
  const valid = [];
  const invalid = [];
  for (const entry of entries) {
    const parsed = parseAllowlistEntry(entry);
    if (!parsed) invalid.push(entry);
    else if (!valid.includes(parsed.entry)) valid.push(parsed.entry);
  }
  return { valid, invalid };
}

/**
 * Whether `ip` may pass `allowlist`. An empty (or missing) list allows
 * everything; otherwise the IP must match an exact entry or fall inside a
 * CIDR range. Malformed entries never match; a malformed IP never passes a
 * non-empty list.
 * @param {string} ip
 * @param {string[] | undefined | null} allowlist
 */
export function isIpAllowed(ip, allowlist) {
  if (!allowlist || allowlist.length === 0) return true;

  const address = normalizeIp(ip);
  const version = net.isIP(address);
  if (!version) return false;

  const blockList = new net.BlockList();
  for (const entry of allowlist) {
    const parsed = parseAllowlistEntry(entry);
    if (!parsed) continue;
    blockList.addSubnet(parsed.address, parsed.prefix, parsed.family);
  }
  return blockList.check(address, version === 4 ? 'ipv4' : 'ipv6');
}

export default { MAX_ALLOWLIST_ENTRIES, normalizeIp, parseAllowlistEntry, normalizeAllowlist, isIpAllowed };
