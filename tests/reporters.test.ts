import { describe, it, expect } from 'vitest';
import { MarkdownReporter } from '../src/reporters/markdown-reporter.js';
import { JsonReporter } from '../src/reporters/json-reporter.js';
import { DiagnosticRunSummary, DiagnosticRunSummarySchema } from '../src/types/index.js';

describe('Reporters', () => {
  const sampleSummary: DiagnosticRunSummary = {
    timestamp: '2026-10-11T12:00:00.000Z',
    workspaceRoot: '/test/app',
    durationMs: 42,
    detectedEnvironment: {
      frontend: 'React',
      backend: 'Express',
      apiType: 'REST',
      hasOpenApi: false
    },
    totalChecks: 10,
    passed: 8,
    failed: 1,
    warned: 1,
    skipped: 0,
    errored: 0,
    findings: [
      {
        id: 'FINDING-BE-CORS-001-1',
        ruleId: 'BE-CORS-001',
        title: 'CORS wildcard with credentials enabled',
        severity: 'CRITICAL',
        category: 'AUTHENTICATION_SECURITY',
        affectedComponent: 'Backend Middleware',
        affectedEndpoint: 'Global',
        symptoms: ['Browser blocks authenticated requests'],
        evidence: {
          description: 'origin: * paired with credentials: true',
          locations: [{ filePath: '/test/app/server.ts', line: 15 }]
        },
        reproductionSteps: ['Send cross-origin fetch with credentials: include'],
        expectedBehavior: 'Explicit origin whitelist configured',
        actualBehavior: 'Wildcard origin returned',
        rootCause: 'Improper CORS configuration',
        confidenceLevel: 'HIGH',
        impact: 'Breaks browser authentication',
        recommendedCorrection: 'Set explicit origin in CORS options',
        regressionTestRequirements: ['Preflight test asserting no wildcard with credentials'],
        repairable: true
      }
    ]
  };

  it('MarkdownReporter generates comprehensive GitHub-Flavored Markdown report', () => {
    const md = MarkdownReporter.generate(sampleSummary);
    expect(md).toContain('# Frontend-Backend Diagnostic Report');
    expect(md).toContain('## 1. Executive Summary');
    expect(md).toContain('## 2. Repository & Environment Summary');
    expect(md).toContain('## 3. Diagnostic Execution & Coverage');
    expect(md).toContain('## 4. Confirmed Findings');
    expect(md).toContain('CORS wildcard with credentials enabled');
    expect(md).toContain('## 8. Prioritized Remediation Plan');
  });

  it('JsonReporter generates JSON conforming to DiagnosticRunSummarySchema', () => {
    const jsonStr = JsonReporter.generate(sampleSummary);
    const parsed = JSON.parse(jsonStr);
    const validated = DiagnosticRunSummarySchema.parse(parsed);

    expect(validated.totalChecks).toBe(10);
    expect(validated.failed).toBe(1);
    expect(validated.findings[0]?.severity).toBe('CRITICAL');
  });
});
