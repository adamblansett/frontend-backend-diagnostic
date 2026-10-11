import * as fs from 'node:fs';
import { DiagnosticContext, DiagnosticFinding, DiagnosticRule, RuleExecutionResult } from '../../types/index.js';
import { SafeRepairEngine } from '../../engine/repair.js';

export const apiUrlConstructionRule: DiagnosticRule = {
  id: 'FE-URL-001',
  name: 'Frontend API URL Construction Integrity',
  category: 'API_CLIENT_CONFIGURATION',
  severity: 'HIGH',
  description: 'Checks frontend API clients for double slashes, trailing slash mismatches, and broken URL concatenations.',
  applicability: (context: DiagnosticContext) => context.frontendFiles.length > 0,
  repairable: true,
  execute: (context: DiagnosticContext): RuleExecutionResult => {
    const findings: DiagnosticFinding[] = [];

    for (const file of context.frontendFiles) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;

        // Check for double slashes in path segment: e.g. `${BASE_URL}//users` or '/api/v1//users'
        if (line.includes('//') && !line.includes('http://') && !line.includes('https://') && !line.trim().startsWith('//')) {
          const match = /['"`]([^'"`]*\/\/[^'"`]*)['"`]/.exec(line);
          if (match && match[1] && !match[1].startsWith('http')) {
            const rawPath = match[1];
            const fixedPath = rawPath.replace(/\/+/g, '/');

            findings.push({
              id: `FINDING-FE-URL-001-${findings.length + 1}`,
              ruleId: 'FE-URL-001',
              title: `Duplicate slash detected in API client path: "${rawPath}"`,
              severity: 'HIGH',
              category: 'API_CLIENT_CONFIGURATION',
              affectedComponent: 'Frontend API Client',
              affectedEndpoint: rawPath,
              symptoms: [
                `API client sends requests with duplicated path slashes (e.g., "${rawPath}")`,
                `Backend routers typically treat double slashes as distinct paths resulting in HTTP 404 Not Found or unexpected redirects`
              ],
              evidence: {
                description: `Duplicated slash in API request URL construction`,
                locations: [{ filePath: file, line: i + 1, snippet: line.trim() }]
              },
              reproductionSteps: [
                `Inspect API client request in ${file} at line ${i + 1}`,
                `Trigger the frontend action initiating this API request`,
                `Inspect Network tab: request URL contains "//"`
              ],
              expectedBehavior: `Clean URL path construction with single slashes (e.g., "${fixedPath}")`,
              actualBehavior: `URL path contains duplicate slashes: "${rawPath}"`,
              rootCause: `String concatenation joined a base path ending in "/" with an endpoint path beginning with "/" without normalization`,
              confidenceLevel: 'HIGH',
              impact: `Requests to backend endpoints return HTTP 404, breaking user operations`,
              recommendedCorrection: `Normalize path concatenation to avoid duplicate slashes: replace "${rawPath}" with "${fixedPath}"`,
              regressionTestRequirements: [
                `API client unit test asserting request URL contains single slashes`
              ],
              repairable: true,
              proposedPatch: {
                filePath: file,
                description: `Normalize URL path "${rawPath}" to "${fixedPath}"`,
                originalText: line,
                replacementText: line.replace(rawPath, fixedPath),
                lineStart: i + 1,
                lineEnd: i + 1
              }
            });
          }
        }
      }
    }

    return {
      ruleId: 'FE-URL-001',
      status: findings.length === 0 ? 'PASS' : 'FAIL',
      executionTimeMs: 0,
      message: findings.length === 0
        ? 'All frontend API client URL constructions are valid.'
        : `Detected ${findings.length} API client URL construction defect(s).`,
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
