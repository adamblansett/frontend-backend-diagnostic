import { RuleRegistry } from '../engine/registry.js';
import { apiUrlConstructionRule } from './frontend/api-url-construction.js';
import { silentErrorSwallowingRule } from './frontend/silent-error-swallowing.js';
import { missingRequestHeadersRule } from './frontend/missing-request-headers.js';
import { corsMisconfigurationRule } from './backend/cors-misconfiguration.js';
import { errorStatusCodesRule } from './backend/error-status-codes.js';
import { routeTrailingSlashRule } from './backend/route-trailing-slash.js';
import { healthcheckEndpointRule } from './backend/healthcheck-endpoint.js';
import { exposedClientSecretsRule } from './env/exposed-client-secrets.js';
import { urlMismatchRule } from './env/url-mismatch.js';
import { responseFieldDriftRule } from './contract/response-field-drift.js';

export function createDefaultRuleRegistry(): RuleRegistry {
  const registry = new RuleRegistry();
  registry.register(apiUrlConstructionRule);
  registry.register(silentErrorSwallowingRule);
  registry.register(missingRequestHeadersRule);
  registry.register(corsMisconfigurationRule);
  registry.register(errorStatusCodesRule);
  registry.register(routeTrailingSlashRule);
  registry.register(healthcheckEndpointRule);
  registry.register(exposedClientSecretsRule);
  registry.register(urlMismatchRule);
  registry.register(responseFieldDriftRule);
  return registry;
}

export * from './frontend/api-url-construction.js';
export * from './frontend/silent-error-swallowing.js';
export * from './frontend/missing-request-headers.js';
export * from './backend/cors-misconfiguration.js';
export * from './backend/error-status-codes.js';
export * from './backend/route-trailing-slash.js';
export * from './backend/healthcheck-endpoint.js';
export * from './env/exposed-client-secrets.js';
export * from './env/url-mismatch.js';
export * from './contract/response-field-drift.js';
