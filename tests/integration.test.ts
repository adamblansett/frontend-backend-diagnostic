import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { ProjectDetector } from '../src/detectors/project-detector.js';
import { DiagnosticRunner } from '../src/engine/runner.js';
import { createDefaultRuleRegistry } from '../src/rules/index.js';

describe('End-to-End Diagnostic & Safe Repair Integration Suite', () => {
  it('runs complete audit on broken-app fixture and identifies all real defects', async () => {
    const fixtureDir = path.resolve('fixtures/broken-app');
    const context = await ProjectDetector.scanWorkspace(fixtureDir);
    const registry = createDefaultRuleRegistry();
    const runner = new DiagnosticRunner(registry);

    const summary = await runner.run(context);

    expect(summary.totalChecks).toBe(10);
    expect(summary.failed).toBeGreaterThanOrEqual(5);
    expect(summary.findings.length).toBeGreaterThanOrEqual(5);

    // Verify critical and high severity findings
    const severities = summary.findings.map((f) => f.severity);
    expect(severities).toContain('CRITICAL');
    expect(severities).toContain('HIGH');

    // Verify specific defect detections
    const ruleIds = summary.findings.map((f) => f.ruleId);
    expect(ruleIds).toContain('FE-URL-001'); // Double slash
    expect(ruleIds).toContain('FE-ERR-001'); // Silent error swallowing
    expect(ruleIds).toContain('FE-HDR-001'); // Missing Content-Type
    expect(ruleIds).toContain('BE-CORS-001'); // CORS wildcard with credentials
    expect(ruleIds).toContain('BE-ERR-001'); // Returning 200 on error
    expect(ruleIds).toContain('BE-RTE-001'); // Route trailing slash
    expect(ruleIds).toContain('ENV-SEC-001'); // Next public db secret
    expect(ruleIds).toContain('ENV-URL-001'); // Port mismatch

    // Verify that secrets are redacted from evidence and report
    const summaryStr = JSON.stringify(summary);
    expect(summaryStr).not.toContain('s3cr3tP@ssw0rd');
    expect(summaryStr).toContain('[REDACTED_SECRET]');
  });

  it('runs complete audit on healthy-app fixture and reports zero failures', async () => {
    const fixtureDir = path.resolve('fixtures/healthy-app');
    const context = await ProjectDetector.scanWorkspace(fixtureDir);
    const registry = createDefaultRuleRegistry();
    const runner = new DiagnosticRunner(registry);

    const summary = await runner.run(context);

    expect(summary.failed).toBe(0);
    expect(summary.findings.length).toBe(0);
    expect(summary.passed).toBeGreaterThanOrEqual(8);
  });

  it('executes safe automated repair workflow and validates fixes via re-run', async () => {
    const srcDir = path.resolve('fixtures/broken-app');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fbd-e2e-repair-'));

    // Copy fixture to temp directory
    fs.cpSync(srcDir, tmpDir, { recursive: true });

    try {
      // 1. Initial scan on temp broken app
      const context = await ProjectDetector.scanWorkspace(tmpDir);
      context.authorizationGranted = true;
      context.dryRun = false;

      const registry = createDefaultRuleRegistry();
      const runner = new DiagnosticRunner(registry);

      const initialSummary = await runner.run(context);
      expect(initialSummary.repairsApplied).toBeDefined();
      expect(initialSummary.repairsApplied!.length).toBeGreaterThan(0);

      // Verify that repairs were recorded
      const applied = initialSummary.repairsApplied!;
      expect(applied.every((r) => r.success)).toBe(true);

      // 2. Re-run scan on the repaired directory to demonstrate the fix works!
      const postFixContext = await ProjectDetector.scanWorkspace(tmpDir);
      const postFixSummary = await runner.run(postFixContext);

      // Repaired rules should now PASS
      const postFixRuleIds = postFixSummary.findings.map((f) => f.ruleId);
      expect(postFixRuleIds).not.toContain('FE-URL-001'); // Double slash fixed
      expect(postFixRuleIds).not.toContain('BE-RTE-001'); // Trailing slash fixed
      expect(postFixRuleIds).not.toContain('ENV-SEC-001'); // Insecure secret prefix fixed
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
