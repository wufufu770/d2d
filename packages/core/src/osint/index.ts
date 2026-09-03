// @wufufu770/d2d-core — OSINT barrel export (#52 + #53 + #54)
export type { OsintItem, OsintResult, OsintProvider, OsintQueryOpts, OsintRouter, OsintRouterOpts } from './types.ts';
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
export { aggregate, summarize } from './aggregate.ts';
export type { AggregateOpts, AggregateResult, AggregateProviderStats, AggregateWriteStats, AggregateDeps, RouterLike } from './aggregate.ts';