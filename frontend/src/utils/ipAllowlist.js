const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

function isIpv6(address) {
  if (!address.includes(':') || !/^[0-9a-fA-F:.]+$/.test(address)) return false;
  try {
    // The URL parser validates IPv6 literals (compressed forms, embedded IPv4).
    return new URL(`http://[${address}]/`).hostname.length > 2;
  } catch {
    return false;
  }
}

/**
 * Basic client-side check for an allowlist entry: an IPv4/IPv6 address or
 * CIDR range ("203.0.113.0/24", "2001:db8::/32"). The server re-validates.
 * @param {string} entry
 */
export function isValidAllowlistEntry(entry) {
  const [address, prefix, extra] = String(entry ?? '').trim().split('/');
  if (extra !== undefined || !address) return false;
  const version = IPV4.test(address) ? 4 : isIpv6(address) ? 6 : 0;
  if (!version) return false;
  if (prefix === undefined) return true;
  if (!/^\d{1,3}$/.test(prefix)) return false;
  return Number(prefix) <= (version === 4 ? 32 : 128);
}

export default isValidAllowlistEntry;
