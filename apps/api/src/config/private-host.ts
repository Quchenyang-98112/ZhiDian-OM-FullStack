/** SSRF guard — SHIP targets must be private/local network addresses only. */

// Note: 169.254.0.0/16 (link-local) is deliberately NOT allowed. It covers the
// cloud metadata endpoint 169.254.169.254 (SSRF against IMDS) and is not a valid
// SHIP/OCPP/Shelly target (APIPA only appears when DHCP has failed). This matches
// the stricter frontend adapter-worker allowlist. Strip an IPv6 [..] bracket and
// any :port before matching so `[::1]:8443` / `192.168.0.5:502` resolve correctly.
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^::1$/,
  /^fe80:/i,
  /\.local$/,
];

/** Strip an IPv6 literal's surrounding brackets and any trailing :port. */
function normalizeHost(host: string): string {
  const trimmed = host.trim().toLowerCase();
  // Bracketed IPv6 literal, optionally with :port — e.g. [fe80::1]:8443
  const bracket = trimmed.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracket?.[1]) return bracket[1];
  // IPv4/hostname with a single :port suffix (avoid stripping bare IPv6 colons)
  const hostPort = trimmed.match(/^([^:]+):\d+$/);
  if (hostPort?.[1]) return hostPort[1];
  return trimmed;
}

export function isPrivateHost(host: string): boolean {
  const normalized = normalizeHost(host);
  return PRIVATE_HOST_PATTERNS.some((p) => p.test(normalized));
}
