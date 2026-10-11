import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { ProjectDetector } from '../src/detectors/project-detector.js';
import { apiUrlConstructionRule } from '../src/rules/frontend/api-url-construction.js';
import { silentErrorSwallowingRule } from '../src/rules/frontend/silent-error-swallowing.js';
import { missingRequestHeadersRule } from '../src/rules/frontend/missing-request-headers.js';
import { corsMisconfigurationRule } from '../src/rules/backend/cors-misconfiguration.js';
import { errorStatusCodesRule } from '../src/rules/backend/error-status-codes.js';
import { routeTrailingSlashRule } from '../src/rules/backend/route-trailing-slash.js';
import { healthcheckEndpointRule } from '../src/rules/backend/healthcheck-endpoint.js';
import { exposedClientSecretsRule } from '../src/rules/env/exposed-client-secrets.js';
import { urlMismatchRule } from '../src/rules/env/url-mismatch.js';

describe('Diagnostic Rules Unit Suite', () => {
  it('FE-URL-001 flags double slashes in broken-app and passes in healthy-app', async () => {
    const brokenContext = await ProjectDetector.scanWorkspace(path.resolve('fixtures/broken-app'));
    const brokenResult = await apiUrlConstructionRule.execute(brokenContext);
    expect(brokenResult.status).toBe('FAIL');
    expect(brokenResult.findings.length).toBeGreaterThan(0);
    expect(brokenResult.findings[0]?.symptoms[0]).toContain('duplicated path slashes');

    const healthyContext = await ProjectDetector.scanWorkspace(path.resolve('fixtures/healthy-app'));
    const healthyResult = await apiUrlConstructionRule.execute(healthyContext);
    expect(healthyResult.status).toBe('PASS');
    expect(healthyResult.findings.length).toBe(0);
  });

  it('FE-ERR-001 flags empty catch blocks returning fallback data', async () => {
    const brokenContext = await ProjectDetector.scanWorkspace(path.resolve('fixtures/broken-app'));
    const brokenResult = await silentErrorSwallowingRule.execute(brokenContext);
    expect(brokenResult.status).toBe('FAIL');
    expect(brokenResult.findings.some((f) => f.title.includes('Catch block returning empty fallback'))).toBe(true);

    const healthyContext = await ProjectDetector.scanWorkspace(path.resolve('fixtures/healthy-app'));
    const healthyResult = await silentErrorSwallowingRule.execute(healthyContext);
    expect(healthyResult.status).toBe('PASS');
  });

  it('FE-HDR-001 flags JSON body without Content-Type header in broken-app', async () => {
    const brokenContext = await ProjectDetector.scanWorkspace(path.resolve('fixtures/broken-app'));
    const brokenResult = await missingRequestHeadersRule.execute(brokenContext);
    expect(brokenResult.status).toBe('FAIL');
    expect(brokenResult.findings[0]?.title).toContain('Content-Type');

    const healthyContext = await ProjectDetector.scanWorkspace(path.resolve('fixtures/healthy-app'));
    const healthyResult = await missingRequestHeadersRule.execute(healthyContext);
    expect(healthyResult.status).toBe('PASS');
  });

  it('BE-CORS-001 flags wildcard origin with credentials in broken-app', async () => {
    const brokenContext = await ProjectDetector.scanWorkspace(path.resolve('fixtures/broken-app'));
    const brokenResult = await corsMisconfigurationRule.execute(brokenContext);
    expect(brokenResult.status).toBe('FAIL');
    expect(brokenResult.findings[0]?.severity).toBe('CRITICAL');
    expect(brokenResult.findings[0]?.title).toContain('origin "*" with credentials: true');

    const healthyContext = await ProjectDetector.scanWorkspace(path.resolve('fixtures/healthy-app'));
    const healthyResult = await corsMisconfigurationRule.execute(healthyContext);
    expect(healthyResult.status).toBe('PASS');
  });

  it('BE-ERR-001 flags route handlers returning 200 on error', async () => {
    const brokenContext = await ProjectDetector.scanWorkspace(path.resolve('fixtures/broken-app'));
    const brokenResult = await errorStatusCodesRule.execute(brokenContext);
    expect(brokenResult.status).toBe('FAIL');
    expect(brokenResult.findings[0]?.title).toContain('HTTP 200 for error responses');

    const healthyContext = await ProjectDetector.scanWorkspace(path.resolve('fixtures/healthy-app'));
    const healthyResult = await errorStatusCodesRule.execute(healthyContext);
    expect(healthyResult.status).toBe('PASS');
  });

  it('BE-RTE-001 flags routes with trailing slash inconsistency', async () => {
    const brokenContext = await ProjectDetector.scanWorkspace(path.resolve('fixtures/broken-app'));
    const brokenResult = await routeTrailingSlashRule.execute(brokenContext);
    expect(brokenResult.status).toBe('FAIL');
    expect(brokenResult.findings.some((f) => f.title.includes('trailing slash'))).toBe(true);

    const healthyContext = await ProjectDetector.scanWorkspace(path.resolve('fixtures/healthy-app'));
    const healthyResult = await routeTrailingSlashRule.execute(healthyContext);
    expect(healthyResult.status).toBe('PASS');
  });

  it('BE-HLT-001 flags missing health check in broken-app and passes in healthy-app', async () => {
    const brokenContext = await ProjectDetector.scanWorkspace(path.resolve('fixtures/broken-app'));
    const brokenResult = await healthcheckEndpointRule.execute(brokenContext);
    expect(brokenResult.status).toBe('WARN');
    expect(brokenResult.findings[0]?.title).toContain('health check');

    const healthyContext = await ProjectDetector.scanWorkspace(path.resolve('fixtures/healthy-app'));
    const healthyResult = await healthcheckEndpointRule.execute(healthyContext);
    expect(healthyResult.status).toBe('PASS');
  });

  it('ENV-SEC-001 flags NEXT_PUBLIC_ exposed database URL with credentials', async () => {
    const brokenContext = await ProjectDetector.scanWorkspace(path.resolve('fixtures/broken-app'));
    const brokenResult = await exposedClientSecretsRule.execute(brokenContext);
    expect(brokenResult.status).toBe('FAIL');
    expect(brokenResult.findings[0]?.severity).toBe('CRITICAL');
    expect(brokenResult.findings[0]?.title).toContain('NEXT_PUBLIC_DATABASE_URL');

    const healthyContext = await ProjectDetector.scanWorkspace(path.resolve('fixtures/healthy-app'));
    const healthyResult = await exposedClientSecretsRule.execute(healthyContext);
    expect(healthyResult.status).toBe('PASS');
  });

  it('ENV-URL-001 flags port mismatch between frontend env (4000) and backend listen (3001)', async () => {
    const brokenContext = await ProjectDetector.scanWorkspace(path.resolve('fixtures/broken-app'));
    const brokenResult = await urlMismatchRule.execute(brokenContext);
    expect(brokenResult.status).toBe('FAIL');
    expect(brokenResult.findings[0]?.evidence.observedData).toEqual({
      configuredPort: '4000',
      actualBackendPort: '3001'
    });

    const healthyContext = await ProjectDetector.scanWorkspace(path.resolve('fixtures/healthy-app'));
    const healthyResult = await urlMismatchRule.execute(healthyContext);
    expect(healthyResult.status).toBe('PASS');
  });
});
