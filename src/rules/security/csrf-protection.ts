import * as fs from 'node:fs';
import { DiagnosticContext, DiagnosticFinding, DiagnosticRule, RuleExecutionResult } from '../../types/index.js';

export const csrfProtectionRule: DiagnosticRule = {
  id: 'SEC-CSRF-001',
  name: 'Cookie-Based State Mutations Missing CSRF Protection',
  category: 'AUTHENTICATION_SECURITY',
  severity: 'HIGH',
  description: 'Detects backend state-changing mutation endpoints (POST/PUT/DELETE) that read cookies without CSRF validation middleware or SameSite protection.',
  applicability: (context: DiagnosticContext) => context.backendFiles.length > 0,
  repairable: false,
  execute: (context: DiagnosticContext): RuleExecutionResult => {
    const findings: DiagnosticFinding[] = [];
    let usesCookies = false;
    let hasCsrfMiddleware = false;

    const mutationRoutes: { file: string; line: number; method: string; path: string }[] = [];
    const routeRegex = /\b(?:app|router)\.(post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g;

    for (const file of context.backendFiles) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf8');

      if (content.includes('cookie-parser') || content.includes('req.cookies') || content.includes('res.cookie')) {
        usesCookies = true;
      }
      if (
        content.includes('csurf') ||
        content.includes('csrf') ||
        content.includes('csrfProtection') ||
        content.includes('sameSite: "strict"') ||
        content.includes("sameSite: 'strict'") ||
        content.includes('sameSite: "lax"') ||
        content.includes("sameSite: 'lax'")
      ) {
        hasCsrfMiddleware = true;
      }

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        let match: RegExpExecArray | null;
        routeRegex.lastIndex = 0;
        while ((match = routeRegex.exec(line)) !== null) {
          mutationRoutes.push({
            file,
            line: i + 1,
            method: match[1]!.toUpperCase(),
            path: match[2]!
          });
        }
      }
    }

    if (usesCookies && !hasCsrfMiddleware && mutationRoutes.length > 0) {
      findings.push({
        id: `FINDING-SEC-CSRF-001-1`,
        ruleId: 'SEC-CSRF-001',
        title: 'State-changing mutation routes lack CSRF protection in cookie-based environment',
        severity: 'HIGH',
        category: 'AUTHENTICATION_SECURITY',
        affectedComponent: 'Backend Security Middleware',
        affectedEndpoint: mutationRoutes[0]?.path,
        symptoms: [
          'State mutations (POST/PUT/DELETE) accept ambient session cookies without validating CSRF token or origin',
          'Vulnerable to Cross-Site Request Forgery (CSRF) via unauthorized third-party origins'
        ],
        evidence: {
          description: 'Cookie handling detected without CSRF validation middleware or SameSite cookies',
          locations: mutationRoutes.slice(0, 3).map((r) => ({
            filePath: r.file,
            line: r.line,
            snippet: `${r.method} ${r.path}`
          }))
        },
        reproductionSteps: [
          'Sign in to generate valid authentication cookie in browser',
          'Submit a cross-site form or image fetch to mutation endpoint',
          'Observe mutation executes without CSRF token verification'
        ],
        expectedBehavior: 'Mutation routes require explicit CSRF tokens or SameSite=Strict cookies',
        actualBehavior: 'Cookies read ambiently on state mutations without CSRF middleware',
        rootCause: 'Missing CSRF validation middleware on state-changing routes',
        confidenceLevel: 'HIGH',
        impact: 'Attacker can forge unauthorized state-changing operations on behalf of authenticated users',
        recommendedCorrection: 'Implement CSRF token middleware or configure SameSite=Strict on all authentication cookies',
        regressionTestRequirements: ['Assert cross-origin mutation without CSRF token returns 403 Forbidden'],
        repairable: false
      });
    }

    return {
      ruleId: 'SEC-CSRF-001',
      status: findings.length === 0 ? 'PASS' : 'FAIL',
      executionTimeMs: 0,
      message: findings.length === 0
        ? 'Cookie-based mutation endpoints implement adequate CSRF protections.'
        : `Detected ${findings.length} CSRF vulnerability finding(s).`,
      findings
    };
  }
};
