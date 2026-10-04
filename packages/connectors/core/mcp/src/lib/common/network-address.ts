import { SsrfAddressKind, ssrfIpClassifier } from '@fema-ipaas/connector-sdk';

export const networkAddress = {
  classifyHost,
  classifyIp,
  isIpLiteral,
};

function classifyHost(hostname: string): AddressKind {
  const host = normalizeHost(hostname);
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return AddressKind.LOOPBACK;
  }
  if (isIpLiteral(host)) {
    return classifyIp(host);
  }
  return AddressKind.PUBLIC;
}

function classifyIp(ip: string): AddressKind {
  const kind = ssrfIpClassifier.classify({ ip });
  switch (kind) {
    case SsrfAddressKind.LOOPBACK:
      return AddressKind.LOOPBACK;
    case SsrfAddressKind.LINK_LOCAL:
      return AddressKind.LINK_LOCAL;
    case SsrfAddressKind.PRIVATE:
    case SsrfAddressKind.INVALID:
      return AddressKind.PRIVATE;
    case SsrfAddressKind.PUBLIC:
      return AddressKind.PUBLIC;
  }
}

function isIpLiteral(host: string): boolean {
  const value = normalizeHost(host);
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(value) || value.includes(':');
}

function normalizeHost(hostname: string): string {
  const lower = hostname.trim().toLowerCase();
  const unbracketed = lower.startsWith('[') && lower.endsWith(']') ? lower.slice(1, -1) : lower;
  return unbracketed.endsWith('.') ? unbracketed.slice(0, -1) : unbracketed;
}

export enum AddressKind {
  LOOPBACK = 'LOOPBACK',
  LINK_LOCAL = 'LINK_LOCAL',
  PRIVATE = 'PRIVATE',
  PUBLIC = 'PUBLIC',
}
