import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { ConfigLoader } from '../src/detectors/config-loader.js';
import { ProjectDetector } from '../src/detectors/project-detector.js';
import { DiagnosticRunner } from '../src/engine/runner.js';
import { createDefaultRuleRegistry } from '../src/rules/index.js';
import { SarifReporter } from '../src/reporters/sarif-reporter.js';
import { DiagnosticRunSummary } from '../src/types/index.js';

describe('ConfigLoader & SARIF Suite', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fbd-config-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads .fbdrc.json configuration file', () => {
    const configPath = path.join(tmpDir, '.fbdrc.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        ignorePaths: ['legacy/**'],
        strict: true,
        rules: {
          'BE-HLT-001': { enabled: false }
        }
      }),
      'utf8'
    );

    const loaded = ConfigLoader.loadConfig(tmpDir);
    expect(loaded).toBeDefined();
    expect(loaded?.strict).toBe(true);
    expect(loaded?.ignorePaths).toContain('legacy/**');
    expect(loaded?.rules?.['BE-HLT-001']?.enabled).toBe(false);
  });

  it('respects rule disable override in DiagnosticRunner', async () => {
    const configPath = path.join(tmpDir, '.fbdrc.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        rules: {
          'BE-HLT-001': { enabled: false }
        }
      }),
      'utf8'
    );

    // Create a server without health endpoint
    const serverPath = path.join(tmpDir, 'server.ts');
    fs.writeFileSync(serverPath, "import express from 'express'; const app = express(); app.listen(3000);", 'utf8');

    const context = await ProjectDetector.scanWorkspace(tmpDir);
    const registry = createDefaultRuleRegistry();
    const runner = new DiagnosticRunner(registry);

    const summary = await runner.run(context);

    // BE-HLT-001 should be skipped because it was disabled via config
    const hltFinding = summary.findings.find((f) => f.ruleId === 'BE-HLT-001');
    expect(hltFinding).toBeUndefined();
    expect(summary.skipped).toBeGreaterThanOrEqual(1);
  });

  it('SarifReporter produces valid OASIS SARIF v2.1.0 output', () => {
    const sampleSummary: DiagnosticRunSummary = {
      timestamp: new Date().toISOString(),
      workspaceRoot: '/test',
      durationMs: 10,
      detectedEnvironment: { hasOpenApi: false },
      totalChecks: 1,
      passed: 0,
      failed: 1,
      warned: 0,
      skipped: 0,
      errored: 0,
      findings: [
        {
          id: 'FINDING-1',
          ruleId: 'BE-CORS-001',
          title: 'CORS wildcard credentials violation',
          severity: 'CRITICAL',
          category: 'AUTHENTICATION_SECURITY',
          affectedComponent: 'CORS',
          symptoms: ['Browser blocks request'],
          evidence: {
            description: 'origin * with credentials',
            locations: [{ filePath: '/test/server.ts', line: 10, column: 1 }]
          },
          reproductionSteps: ['Send request with credentials'],
          expectedBehavior: 'Explicit origin',
          actualBehavior: 'Wildcard origin',
          rootCause: 'Invalid CORS',
          confidenceLevel: 'HIGH',
          impact: 'Auth failure',
          recommendedCorrection: 'Set explicit origin',
          regressionTestRequirements: ['CORS test'],
          repairable: true
        }
      ]
    };

    const sarifStr = SarifReporter.generate(sampleSummary);
    const parsed = JSON.parse(sarifStr);

    expect(parsed.version).toBe('2.1.0');
    expect(parsed.runs.length).toBe(1);
    expect(parsed.runs[0].tool.driver.name).toBe('frontend-backend-diagnostic');
    expect(parsed.runs[0].results.length).toBe(1);
    expect(parsed.runs[0].results[0].ruleId).toBe('BE-CORS-001');
    expect(parsed.runs[0].results[0].level).toBe('error');
    expect(parsed.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe('/test/server.ts');
  });
});
