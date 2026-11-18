import * as fs from 'node:fs';
import { DiagnosticContext, DiagnosticFinding, DiagnosticRule, RuleExecutionResult } from '../../types/index.js';

export const RateLimitingRule: DiagnosticRule = {
  id: 'SEC-RATE-001',
  name: 'Missing Rate Limiting on Authentication Endpoints',
  category: 'AUTHENTICATION_SECURITY',
  severity: 'HIGH',
  description: 'Detects sensitive authentication and credential endpoints that lack rate limiting middleware, exposing them to brute-force and credential stuffing attacks.',
  applicability: (context: DiagnosticContext) => context.backendFiles.length > 0,
  repairable: false,

  execute: async (context: DiagnosticContext): Promise<RuleExecutionResult> => {
    const startTime = Date.now();
    const findings: DiagnosticFinding[] = [];

    const AUTH_ROUTE_REGEX = /(?:app|router)\.(?:post|all)\s*\(\s*['"`]([^'"`]*(?:login|signin|register|signup|reset-password|forgot-password|auth\/token)[^'"`]*)['"`]/i;
    const RATE_LIMIT_KEYWORD = /rateLimit|express-rate-limit|fastify-rate-limit|limiter|rateLimiter/i;

    for (const file of context.backendFiles) {
      if (!file.endsWith('.ts') && !file.endsWith('.js')) continue;

      let content: string;
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }

      // Check if file defines an authentication endpoint
      const match = AUTH_ROUTE_REGEX.exec(content);
      if (match) {
        const endpoint = match[1]!;
        // Check if rate limiting middleware is imported or referenced in this file or across server
        const hasRateLimiter = RATE_LIMIT_KEYWORD.test(content);

        if (!hasRateLimiter) {
          findings.push({
            id: `FINDING-SEC-RATE-001-${findings.length + 1}`,
            ruleId: 'SEC-RATE-001',
            title: `Authentication endpoint "${endpoint}" in ${file} lacks rate limiting`,
            severity: 'HIGH',
            category: 'AUTHENTICATION_SECURITY',
            affectedComponent: 'Backend Authentication Layer',
            affectedEndpoint: endpoint,
            symptoms: [
              `Endpoint "${endpoint}" does not enforce request rate limits`,
              'Allows unlimited automated login/password attempts from single or distributed origins'
            ],
            evidence: {
              description: `Route definition for "${endpoint}" lacks rate limiting middleware`,
              locations: [{ filePath: file, line: 1, snippet: match[0] }]
            },
            reproductionSteps: [
              `Send 100 rapid consecutive POST requests to ${endpoint}`,
              'Verify that all requests receive HTTP 200/401 without receiving HTTP 429 Too Many Requests'
            ],
            expectedBehavior: 'Authentication and password endpoints must enforce rate limiting (HTTP 429) to thwart brute-force attacks',
            actualBehavior: 'Endpoint permits unlimited submission attempts without throttling',
            rootCause: 'No rate limiting middleware was configured for this authentication route',
            confidenceLevel: 'HIGH',
            impact: 'Vulnerable to credential stuffing, dictionary password guessing, and resource exhaustion',
            recommendedCorrection: 'Apply express-rate-limit or similar middleware: `const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }); router.post("' + endpoint + '", limiter, handler);`',
            regressionTestRequirements: ['Security test verifying 429 response after exceeding threshold'],
            repairable: false
          });
        }
      }
    }

    return {
      ruleId: 'SEC-RATE-001',
      status: findings.length > 0 ? 'FAIL' : 'PASS',
      executionTimeMs: Date.now() - startTime,
      message:
        findings.length > 0
          ? `Found ${findings.length} authentication endpoint(s) without rate limiting.`
          : 'All observable authentication endpoints configure rate limiting.',
      findings
    };
  }
};
