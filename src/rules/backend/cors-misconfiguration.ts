import * as fs from 'node:fs';
import { DiagnosticContext, DiagnosticFinding, DiagnosticRule, RuleExecutionResult } from '../../types/index.js';
import { SafeRepairEngine } from '../../engine/repair.js';

export const corsMisconfigurationRule: DiagnosticRule = {
  id: 'BE-CORS-001',
  name: 'CORS Wildcard with Credentials Misconfiguration',
  category: 'AUTHENTICATION_SECURITY',
  severity: 'CRITICAL',
  description: 'Detects illegal CORS combinations where origin wildcard "*" is combined with credentials: true, which is rejected by all modern browsers and creates security vulnerabilities.',
  applicability: (context: DiagnosticContext) => context.backendFiles.length > 0,
  repairable: true,
  execute: (context: DiagnosticContext): RuleExecutionResult => {
    const findings: DiagnosticFinding[] = [];
    const corsBlockRegex = /cors\s*\(\s*\{([^}]+)\}\s*\)/g;
    const headerOriginWildcard = /res\.header\s*\(\s*['"`]Access-Control-Allow-Origin['"`]\s*,\s*['"`]\*['"`]\s*\)/i;
    const headerCredsTrue = /res\.header\s*\(\s*['"`]Access-Control-Allow-Credentials['"`]\s*,\s*['"`]true['"`]\s*\)/i;

    for (const file of context.backendFiles) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf8');

      // Check cors({ origin: '*', credentials: true })
      let match: RegExpExecArray | null;
      while ((match = corsBlockRegex.exec(content)) !== null) {
        const body = match[1]!;
        const hasWildcardOrigin = /origin\s*:\s*['"`]\*['"`]/.test(body) || /origin\s*:\s*true/.test(body);
        const hasCredentialsTrue = /credentials\s*:\s*true/.test(body);

        if (hasWildcardOrigin && hasCredentialsTrue) {
          const line = content.substring(0, match.index).split('\n').length;
          findings.push({
            id: `FINDING-BE-CORS-001-${findings.length + 1}`,
            ruleId: 'BE-CORS-001',
            title: `Invalid CORS configuration: origin "*" with credentials: true in ${file}`,
            severity: 'CRITICAL',
            category: 'AUTHENTICATION_SECURITY',
            affectedComponent: 'Backend CORS Middleware',
            affectedEndpoint: 'Global Middleware',
            symptoms: [
              'Browser blocks all authenticated cross-origin requests with console error: "The value of the \'Access-Control-Allow-Origin\' header in the response must not be the wildcard \'*\' when the request\'s credentials mode is \'include\'."',
              'Session cookies and Authorization headers are rejected by client browsers'
            ],
            evidence: {
              description: 'CORS options combine wildcard origin with credentials enabled',
              locations: [{ filePath: file, line, snippet: match[0] }]
            },
            reproductionSteps: [
              `Send cross-origin fetch request with credentials: 'include'`,
              `Observe browser network console: CORS error blocks response from reaching application code`
            ],
            expectedBehavior: 'CORS configuration specifies explicit trusted origins (e.g. process.env.ALLOWED_ORIGINS) when credentials: true',
            actualBehavior: 'Wildcard origin "*" is paired with credentials: true, triggering browser security rejection',
            rootCause: 'Developer attempted to enable both open CORS and authenticated sessions without realizing Fetch specification forbids wildcard origins with credentials',
            confidenceLevel: 'HIGH',
            impact: 'Complete authentication failure for cross-origin frontend-to-backend communication',
            recommendedCorrection: 'Replace wildcard origin "*" with explicit origin or environment-configured origin whitelist: origin: process.env.CLIENT_URL || "http://localhost:3000"',
            regressionTestRequirements: [
              'CORS integration test asserting preflight OPTIONS response does not return wildcard origin when credentials are true'
            ],
            repairable: true,
            proposedPatch: {
              filePath: file,
              description: 'Replace origin "*" with explicit client origin',
              originalText: match[0],
              replacementText: match[0].replace(/origin\s*:\s*['"`]\*['"`]/, 'origin: process.env.CLIENT_ORIGIN || "http://localhost:3000"'),
              lineStart: line,
              lineEnd: line
            }
          });
        }
      }

      // Check manual headers
      if (headerOriginWildcard.test(content) && headerCredsTrue.test(content)) {
        const line = content.substring(0, content.search(headerOriginWildcard)).split('\n').length;
        findings.push({
          id: `FINDING-BE-CORS-001-${findings.length + 1}`,
          ruleId: 'BE-CORS-001',
          title: `Access-Control-Allow-Origin: * combined with Access-Control-Allow-Credentials: true in ${file}`,
          severity: 'CRITICAL',
          category: 'AUTHENTICATION_SECURITY',
          affectedComponent: 'Backend HTTP Headers',
          symptoms: ['Browser blocks response due to illegal CORS credentials specification'],
          evidence: {
            description: 'Manual headers set both wildcard origin and credentials: true',
            locations: [{ filePath: file, line }]
          },
          reproductionSteps: ['Send credentialed request and inspect browser CORS error'],
          expectedBehavior: 'Explicit origin specified when credentials are required',
          actualBehavior: 'Wildcard origin returned with credentials: true',
          rootCause: 'Inconsistent manual CORS headers',
          confidenceLevel: 'HIGH',
          impact: 'Frontend cannot access response body or status on authenticated requests',
          recommendedCorrection: 'Set Access-Control-Allow-Origin to request origin or specific whitelist',
          regressionTestRequirements: ['Verify response headers on credentialed request'],
          repairable: false
        });
      }
    }

    return {
      ruleId: 'BE-CORS-001',
      status: findings.length === 0 ? 'PASS' : 'FAIL',
      executionTimeMs: 0,
      message: findings.length === 0
        ? 'CORS configurations are compliant with web standards.'
        : `Detected ${findings.length} critical CORS misconfiguration(s).`,
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
