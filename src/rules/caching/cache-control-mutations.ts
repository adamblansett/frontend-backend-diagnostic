import * as fs from 'node:fs';
import { DiagnosticContext, DiagnosticFinding, DiagnosticRule, RuleExecutionResult } from '../../types/index.js';

export const cacheControlMutationsRule: DiagnosticRule = {
  id: 'NET-CACHE-001',
  name: 'Public Cache-Control Configured on Mutation Endpoints',
  category: 'CACHING_STATE_MANAGEMENT',
  severity: 'MEDIUM',
  description: 'Detects state mutation handlers (POST/PUT/DELETE/PATCH) that return public or long-lived Cache-Control headers, causing proxies and CDNs to serve stale responses.',
  applicability: (context: DiagnosticContext) => context.backendFiles.length > 0,
  repairable: false,
  execute: (context: DiagnosticContext): RuleExecutionResult => {
    const findings: DiagnosticFinding[] = [];
    const publicCacheRegex = /Cache-Control['"`]\s*,\s*['"`](?:public|max-age=[1-9])/i;
    const mutationRegex = /\b(?:app|router)\.(post|put|delete|patch)\s*\(/;

    for (const file of context.backendFiles) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (mutationRegex.test(line)) {
          const handlerBlock = lines.slice(i, Math.min(lines.length, i + 20)).join('\n');
          if (publicCacheRegex.test(handlerBlock)) {
            findings.push({
              id: `FINDING-NET-CACHE-001-${findings.length + 1}`,
              ruleId: 'NET-CACHE-001',
              title: `Mutation route in ${file} specifies public/cached Cache-Control header`,
              severity: 'MEDIUM',
              category: 'CACHING_STATE_MANAGEMENT',
              affectedComponent: 'HTTP Caching Headers',
              symptoms: [
                'Subsequent mutation requests return cached responses instead of executing server logic',
                'Frontend displays stale data after creating or modifying resources'
              ],
              evidence: {
                description: 'Public Cache-Control header configured in mutation handler',
                locations: [{ filePath: file, line: i + 1, snippet: line.trim() }]
              },
              reproductionSteps: [
                'Send POST/PUT request through intermediate caching proxy',
                'Observe response header includes Cache-Control: public or max-age > 0',
                'Send subsequent mutation request: served from cache without reaching server'
              ],
              expectedBehavior: 'Mutation routes should return Cache-Control: no-store, no-cache, must-revalidate',
              actualBehavior: 'Mutation route returns cacheable Cache-Control header',
              rootCause: 'Improper caching header set on non-idempotent or mutation route',
              confidenceLevel: 'HIGH',
              impact: 'Stale cached state and silent failure of resource mutations',
              recommendedCorrection: 'Set res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate")',
              regressionTestRequirements: ['Assert mutation response header has Cache-Control: no-store'],
              repairable: false
            });
          }
        }
      }
    }

    return {
      ruleId: 'NET-CACHE-001',
      status: findings.length === 0 ? 'PASS' : 'WARN',
      executionTimeMs: 0,
      message: findings.length === 0
        ? 'No inappropriate public caching detected on mutation endpoints.'
        : `Detected ${findings.length} mutation endpoint(s) with public caching headers.`,
      findings
    };
  }
};
