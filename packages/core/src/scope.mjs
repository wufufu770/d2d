// @wufufu770/d2d-core - scope parser
// Format: "ztgame.com,!mail.ztgame.com,!222.73.243."
// - Comma-separated entries
// - ! prefix = exclude (denylist)
// - Otherwise = include
// - CIDR (e.g. 10.0.0.0/8) treated as include
// - Domain (e.g. ztgame.com) treated as include (with subdomain match)

export function parseScope(scopeStr) {
  if (!scopeStr || typeof scopeStr !== 'string') {
    return { include: [], exclude: [], raw: '' };
  }
  const entries = scopeStr.split(',').map(s => s.trim()).filter(Boolean);
  const include = [];
  const exclude = [];
  for (const e of entries) {
    if (e.startsWith('!')) {
      exclude.push(e.slice(1).trim());
    } else {
      include.push(e);
    }
  }
  return { include, exclude, raw: scopeStr };
}

// Host name match: domain (subdomain match) or exact
function hostInPattern(host, pattern) {
  if (!host || !pattern) return false;
  // CIDR with slash: 10.0.0.0/8
  if (pattern.includes('/')) {
    return cidrMatch(host, pattern);
  }
  // CIDR with trailing dot prefix: 10.0. (matches 10.0.x.x)
  if (/^\d+\.\d+\.\d+\.$/.test(pattern)) {
    return host.startsWith(pattern);
  }
  // Domain starting with . (e.g. .ztgame.com)
  if (pattern.startsWith('.')) {
    return host.endsWith(pattern);
  }
  // Exact match
  if (host === pattern) return true;
  // Subdomain match (e.g. pattern=ztgame.com matches www.ztgame.com)
  if (host.endsWith('.' + pattern)) return true;
  // IP prefix match (e.g. pattern=10.0. matches 10.0.0.1)
  if (/^\d+\./.test(pattern) && host.startsWith(pattern)) {
    return true;
  }
  return false;
}

function cidrMatch(host, pattern) {
  // Simplified: if pattern ends with ".", match as prefix
  if (pattern.endsWith('.')) {
    return host.startsWith(pattern);
  }
  // For real CIDR we'd need ip2long + bitwise
  // For MVP, fall back to substring
  return host.startsWith(pattern.split('/')[0]);
}

export function isInScope(host, scope) {
  if (!scope) return false;
  if (!host) return false;
  // First check exclude
  for (const ex of scope.exclude) {
    if (hostInPattern(host, ex)) return false;
  }
  // Then check include
  for (const inc of scope.include) {
    if (hostInPattern(host, inc)) return true;
  }
  return false;
}

export function isOutOfScope(host, scope) {
  return !isInScope(host, scope);
}

// Merge multiple scope strings (union of includes, union of excludes)
export function mergeScopes(...scopes) {
  const all = scopes.map(s => parseScope(s));
  return {
    include: [...new Set(all.flatMap(s => s.include))],
    exclude: [...new Set(all.flatMap(s => s.exclude))],
    raw: all.map(s => s.raw).join(' | '),
  };
}

// Global denylist (RFC1918 private + link-local)
const GLOBAL_DENY_PATTERNS = [
  '127.',          // loopback
  '10.',           // RFC1918
  '172.16.', '172.17.', '172.18.', '172.19.',
  '172.20.', '172.21.', '172.22.', '172.23.',
  '172.24.', '172.25.', '172.26.', '172.27.',
  '172.28.', '172.29.', '172.30.', '172.31.',
  '192.168.',      // RFC1918
  '169.254.',      // link-local (AWS metadata)
  '::1', 'fe80:',  // IPv6
  'localhost',
];

export function isGlobalDeny(host) {
  if (!host) return false;
  for (const p of GLOBAL_DENY_PATTERNS) {
    if (host === p || host.startsWith(p) || host === 'localhost') return true;
  }
  return false;
}
