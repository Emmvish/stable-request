import { NodeCryptoLike } from '../types/index.js';

export const getNodeCrypto = (): NodeCryptoLike | null => {
  const maybeRequire = (globalThis as { require?: (id: string) => unknown }).require;
  if (typeof maybeRequire === 'function') {
    try {
      const mod = maybeRequire('crypto') as NodeCryptoLike;
      if (mod && typeof mod.createHash === 'function') {
        return mod;
      }
    } catch {
      return null;
    }
  }
  return null;
};

export const simpleHashToHex = (input: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};
