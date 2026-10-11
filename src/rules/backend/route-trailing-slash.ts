import * as fs from 'node:fs';
import { DiagnosticContext, DiagnosticFinding, DiagnosticRule, RuleExecutionResult } from '../../types/index.js';
import { SafeRepairEngine } from '../../engine/repair.js';

export const routeTrailingSlashRule: DiagnosticRule = {
  id: 'BE-RTE-001',
  name: 'Route Path Trailing Slash Inconsistency',
  category: 'ROUTING_HTTP_SEMANTICS',
  severity: 'MEDIUM',
  description: 'Detects backend route path declarations ending with trailing slashes that cause routing mismatches or 301/308 body-stripping redirects.',
  applicability: (context: DiagnosticContext) => context.backendFiles.length > 0,
  repairable: true,
  execute: (context: DiagnosticContext): RuleExecutionResult => {
    const findings: DiagnosticFinding[] = [];
    const routeRegex = /\b(?:app|router)\.(?:get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g;

    for (const file of context.backendFiles) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        let match: RegExpExecArray | null;
        routeRegex.lastIndex = 0;

        while ((match = routeRegex.exec(line)) !== null) {
          const routePath = match[1]!;
          if (routePath.length > 1 && routePath.endsWith('/')) {
            const normalized = routePath.replace(/\/+$/, '');
            findings.push({
              id: `FINDING-BE-RTE-001-${findings.length + 1}`,
              ruleId: 'BE-RTE-001',
              title: `Route declaration ends with trailing slash: "${routePath}" in ${file}`,
              severity: 'MEDIUM',
              category: 'ROUTING_HTTP_SEMANTICS',
              affectedComponent: 'Backend Route Handler',
              affectedEndpoint: routePath,
              symptoms: [
                `Requests to "${normalized}" return HTTP 404 or redirect (HTTP 301/308) to "${routePath}"`,
                `POST / PUT requests redirected via 301 may lose request payload in older HTTP clients`
              ],
              evidence: {
                description: 'Trailing slash present on route declaration',
                locations: [{ filePath: file, line: i + 1, snippet: line.trim() }]
              },
              reproductionSteps: [
                `Send GET request to "${normalized}" (standard frontend convention without trailing slash)`,
                `Observe backend fails to match route or responds with redirect`
              ],
              expectedBehavior: 'Canonical routes without trailing slashes (e.g. "/api/v1/users")',
              actualBehavior: `Route defined with trailing slash: "${routePath}"`,
              rootCause: 'Inconsistent trailing slash convention in router definition',
              confidenceLevel: 'HIGH',
              impact: 'API requests fail or experience added redirect latency',
              recommendedCorrection: `Normalize route path to "${normalized}"`,
              regressionTestRequirements: [`Route test verifying access via "${normalized}"`],
              repairable: true,
              proposedPatch: {
                filePath: file,
                description: `Remove trailing slash from route "${routePath}"`,
                originalText: `'${routePath}'`,
                replacementText: `'${normalized}'`,
                lineStart: i + 1,
                lineEnd: i + 1
              }
            });
          }
        }
      }
    }

    return {
      ruleId: 'BE-RTE-001',
      status: findings.length === 0 ? 'PASS' : 'FAIL',
      executionTimeMs: 0,
      message: findings.length === 0
        ? 'All backend route paths follow canonical trailing slash conventions.'
        : `Detected ${findings.length} route(s) with trailing slash inconsistencies.`,
      findings
    };
  },
  repair: (_context: DiagnosticContext, finding: DiagnosticFinding): boolean => {
    if (finding.proposedPatch) {
      return SafeRepairEngine.applyPatch(finding.proposedPatch);
    }
    return false;
  }
};
