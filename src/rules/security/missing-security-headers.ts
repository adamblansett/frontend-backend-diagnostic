import * as fs from 'node:fs';
import { DiagnosticContext, DiagnosticFinding, DiagnosticRule, RuleExecutionResult } from '../../types/index.js';

export const MissingSecurityHeadersRule: DiagnosticRule = {
  id: 'SEC-HDR-001',
  name: 'Missing Security Headers Middleware',
  category: 'AUTHENTICATION_SECURITY',
  severity: 'HIGH',
  description: 'Detects backend HTTP server entry points that lack standard security response headers or Helmet protection.',
  applicability: (context: DiagnosticContext) => context.backendFiles.length > 0,
  repairable: false,

  execute: async (context: DiagnosticContext): Promise<RuleExecutionResult> => {
    const startTime = Date.now();
    const findings: DiagnosticFinding[] = [];

    // Only apply to backend server entrypoints (e.g. server.ts, app.ts, index.ts)
    for (const file of context.backendFiles) {
      if (!file.endsWith('.ts') && !file.endsWith('.js')) continue;

      let content: string;
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }

      // Check if file instantiates an express or fastify server and listens on a port
      const isServerEntry =
        (content.includes('express()') || content.includes('fastify(') || content.includes('createServer(')) &&
        (content.includes('.listen(') || content.includes('app.use('));

      if (!isServerEntry) continue;

      // Check whether helmet or standard security headers are configured
      const hasHelmet = content.includes('helmet') || content.includes('fastifyHelmet');
      const hasSecurityHeaders =
        content.includes('X-Content-Type-Options') ||
        content.includes('Content-Security-Policy') ||
        content.includes('Strict-Transport-Security') ||
        content.includes('nosniff');

      if (!hasHelmet && !hasSecurityHeaders) {
        findings.push({
          id: `FINDING-SEC-HDR-001-${findings.length + 1}`,
          ruleId: 'SEC-HDR-001',
          title: `Server in ${file} omits critical HTTP security headers (Helmet / HSTS / nosniff)`,
          severity: 'HIGH',
          category: 'AUTHENTICATION_SECURITY',
          affectedComponent: 'Backend HTTP Middleware',
          affectedEndpoint: file,
          symptoms: [
            'HTTP responses lack MIME-sniffing protection, clickjacking protection, or HSTS headers'
          ],
          evidence: {
            description: `Server entrypoint ${file} omits helmet or security header middleware`,
            locations: [{ filePath: file, line: 1, snippet: 'Missing helmet() or security response headers' }]
          },
          reproductionSteps: [
            `Launch backend server in ${file}`,
            'Send an HTTP request and inspect response headers with curl -I',
            'Verify omission of X-Content-Type-Options, X-Frame-Options, and Content-Security-Policy'
          ],
          expectedBehavior: 'Backend API servers should apply standard security headers via helmet() or explicit response headers',
          actualBehavior: 'Server serves responses without essential HTTP security headers, leaving clients vulnerable to MIME confusion and clickjacking',
          rootCause: 'Security header middleware was not mounted on the application instance',
          confidenceLevel: 'MEDIUM',
          impact: 'Client browsers are exposed to clickjacking, cross-site script inclusion, and MIME-type confusion attacks',
          recommendedCorrection: 'Install helmet (`npm i helmet`) and register it early: `app.use(helmet());`',
          regressionTestRequirements: ['Security test verifying response headers include X-Content-Type-Options: nosniff'],
          repairable: false
        });
      }
    }

    return {
      ruleId: 'SEC-HDR-001',
      status: findings.length > 0 ? 'FAIL' : 'PASS',
      executionTimeMs: Date.now() - startTime,
      message:
        findings.length > 0
          ? `Found ${findings.length} server entrypoint(s) missing security headers.`
          : 'All server entrypoints configure Helmet or standard HTTP security headers.',
      findings
    };
  }
};
