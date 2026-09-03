// @wufufu770/d2d-core — OSINT barrel export (Issue #53 credentials)
//
// #52 providers + #53 credentials land in this barrel.
// Provider modules will be added when #52 merges into monorepo.
export {
  CredentialStore,
  PROVIDER_IDS,
  defaultPaths,
  encrypt,
  decrypt,
  deriveKey,
  fingerprint,
  loadHostKey,
  runCli,
  FILE_MODE,
} from './credentials.ts';
export type { ProviderId, CredentialsPaths, CredentialsFile, CredentialEntry } from './credentials.ts';