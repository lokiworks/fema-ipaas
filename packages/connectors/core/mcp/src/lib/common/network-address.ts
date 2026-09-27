export const networkAddress = {
  classifyHost,
  classifyIp,
  isIpLiteral,
};

function classifyHost(hostname: string): AddressKind {
  const host = stripBrackets(hostname.toLowerCase());
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return AddressKind.LOOPBACK;
  }
  if (isIpLiteral(host)) {
    return classifyIp(host);
  }
  return AddressKind.PUBLIC;
}

function classifyIp(ip: string): AddressKind {
  const value = stripBrackets(ip.toLowerCase());
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  if (mapped !== null) {
    return classifyIp(mapped[1]);
  }
  const v4 = parseIpv4(value);
  if (v4 !== null) {
    return classifyIpv4(v4);
  }
  return classifyIpv6(value);
}

function isIpLiteral(host: string): boolean {
  const value = stripBrackets(host);
  return parseIpv4(value) !== null || value.includes(':');
}

function classifyIpv4([a, b]: number[]): AddressKind {
  if (a === 127 || a === 0) {
    return AddressKind.LOOPBACK;
  }
  if (a === 169 && b === 254) {
    return AddressKind.LINK_LOCAL;
  }
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) {
    return AddressKind.PRIVATE;
  }
  return AddressKind.PUBLIC;
}

function classifyIpv6(value: string): AddressKind {
  if (value === '::1' || value === '::') {
    return AddressKind.LOOPBACK;
  }
  if (/^fe[89ab][0-9a-f]:/.test(value)) {
    return AddressKind.LINK_LOCAL;
  }
  if (/^f[cd][0-9a-f]{2}:/.test(value)) {
    return AddressKind.PRIVATE;
  }
  return AddressKind.PUBLIC;
}

function parseIpv4(value: string): number[] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (match === null) {
    return null;
  }
  const parts = match.slice(1).map(Number);
  return parts.every((part) => part >= 0 && part <= 255) ? parts : null;
}

function stripBrackets(value: string): string {
  return value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value;
}

export enum AddressKind {
  LOOPBACK = 'LOOPBACK',
  LINK_LOCAL = 'LINK_LOCAL',
  PRIVATE = 'PRIVATE',
  PUBLIC = 'PUBLIC',
}
