import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { ProjectDetector } from '../src/detectors/project-detector.js';
import { ContractValidator } from '../src/contract/contract-validator.js';

describe('ContractValidator', () => {
  it('detects contract field drift in broken-app', async () => {
    const context = await ProjectDetector.scanWorkspace(path.resolve('fixtures/broken-app'));
    const routes = ContractValidator.extractBackendRoutes(context.backendFiles);
    const calls = ContractValidator.extractFrontendCalls(context.frontendFiles);

    expect(routes.length).toBeGreaterThan(0);
    expect(calls.length).toBeGreaterThan(0);

    const findings = ContractValidator.compareContracts(calls, routes);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]?.category).toBe('RESPONSE_CONTRACTS');
    expect(findings[0]?.rootCause).toContain('Backend schema drifted');
  });

  it('verifies contract agreement in healthy-app', async () => {
    const context = await ProjectDetector.scanWorkspace(path.resolve('fixtures/healthy-app'));
    const routes = ContractValidator.extractBackendRoutes(context.backendFiles);
    const calls = ContractValidator.extractFrontendCalls(context.frontendFiles);

    expect(routes.length).toBeGreaterThan(0);
    expect(calls.length).toBeGreaterThan(0);

    const findings = ContractValidator.compareContracts(calls, routes);
    expect(findings.length).toBe(0);
  });
});
