import { RuleRegistry } from '../engine/registry.js';
import { apiUrlConstructionRule } from './frontend/api-url-construction.js';
import { silentErrorSwallowingRule } from './frontend/silent-error-swallowing.js';
import { missingRequestHeadersRule } from './frontend/missing-request-headers.js';
import { missingAbortSignalRule } from './frontend/missing-abort-signal.js';
import { corsMisconfigurationRule } from './backend/cors-misconfiguration.js';
import { errorStatusCodesRule } from './backend/error-status-codes.js';
import { routeTrailingSlashRule } from './backend/route-trailing-slash.js';
import { healthcheckEndpointRule } from './backend/healthcheck-endpoint.js';
import { csrfProtectionRule } from './security/csrf-protection.js';
import { sensitiveStorageRule } from './security/sensitive-storage.js';
import { cacheControlMutationsRule } from './caching/cache-control-mutations.js';
import { exposedClientSecretsRule } from './env/exposed-client-secrets.js';
import { urlMismatchRule } from './env/url-mismatch.js';
import { responseFieldDriftRule } from './contract/response-field-drift.js';

export function createDefaultRuleRegistry(): RuleRegistry {
  const registry = new RuleRegistry();
  registry.register(apiUrlConstructionRule);
  registry.register(silentErrorSwallowingRule);
  registry.register(missingRequestHeadersRule);
  registry.register(missingAbortSignalRule);
  registry.register(corsMisconfigurationRule);
  registry.register(errorStatusCodesRule);
  registry.register(routeTrailingSlashRule);
  registry.register(healthcheckEndpointRule);
  registry.register(csrfProtectionRule);
  registry.register(sensitiveStorageRule);
  registry.register(cacheControlMutationsRule);
  registry.register(exposedClientSecretsRule);
  registry.register(urlMismatchRule);
  registry.register(responseFieldDriftRule);
  return registry;
}

export * from './frontend/api-url-construction.js';
export * from './frontend/silent-error-swallowing.js';
export * from './frontend/missing-request-headers.js';
export * from './frontend/missing-abort-signal.js';
export * from './backend/cors-misconfiguration.js';
export * from './backend/error-status-codes.js';
export * from './backend/route-trailing-slash.js';
export * from './backend/healthcheck-endpoint.js';
export * from './security/csrf-protection.js';
export * from './security/sensitive-storage.js';
export * from './caching/cache-control-mutations.js';
export * from './env/exposed-client-secrets.js';
export * from './env/url-mismatch.js';
export * from './contract/response-field-drift.js';
