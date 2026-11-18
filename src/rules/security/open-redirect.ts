import * as fs from 'node:fs';
import { DiagnosticContext, DiagnosticFinding, DiagnosticRule, RuleExecutionResult } from '../../types/index.js';

export const OpenRedirectRule: DiagnosticRule = {
  id: 'SEC-REDIR-001',
  name: 'Unvalidated / Open Redirect Vulnerability',
  category: 'AUTHENTICATION_SECURITY',
  severity: 'HIGH',
  description: 'Detects backend route handlers redirecting clients directly to user-supplied query or body parameters without URL validation.',
  applicability: (context: DiagnosticContext) => context.backendFiles.length > 0,
  repairable: false,

  execute: async (context: DiagnosticContext): Promise<RuleExecutionResult> => {
    const startTime = Date.now();
    const findings: DiagnosticFinding[] = [];

    // Matches res.redirect(req.query.xxx) or res.redirect(req.body.xxx) or res.redirect(req.params.xxx)
    const OPEN_REDIRECT_REGEX = /res\.redirect\s*\(\s*(?:req\.(?:query|body|params)\.[a-zA-Z0-9_]+|url|target|redirectUrl|returnTo)\s*\)/;

    for (const file of context.backendFiles) {
      if (!file.endsWith('.ts') && !file.endsWith('.js')) continue;

      let content: string;
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }

      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;

        if (OPEN_REDIRECT_REGEX.test(line)) {
          // Check if there is an allowlist or relative path check nearby
          const surroundingContext = lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 5)).join('\n');
          const hasValidation =
            surroundingContext.includes('.startsWith(\'/\')') ||
            surroundingContext.includes('.startsWith("/")') ||
            surroundingContext.includes('whitelist') ||
            surroundingContext.includes('allowlist') ||
            surroundingContext.includes('isAllowed');

          if (!hasValidation) {
            findings.push({
              id: `FINDING-SEC-REDIR-001-${findings.length + 1}`,
              ruleId: 'SEC-REDIR-001',
              title: `Potential Open Redirect in ${file}:${i + 1}`,
              severity: 'HIGH',
              category: 'AUTHENTICATION_SECURITY',
              affectedComponent: 'Backend Redirect Handler',
              affectedEndpoint: file,
              symptoms: [
                `Direct redirection to user-controlled parameter on line ${i + 1} without validation`
              ],
              evidence: {
                description: `res.redirect() executes with unvalidated parameter on line ${i + 1}`,
                locations: [{ filePath: file, line: i + 1, snippet: line.trim() }]
              },
              reproductionSteps: [
                `Call redirect endpoint with ?returnUrl=https://malicious-phishing-site.example.com`,
                'Verify that client browser is forwarded directly to the external malicious domain'
              ],
              expectedBehavior: 'Redirect targets must be restricted to relative paths (e.g. url.startsWith("/")) or an explicit domain allowlist',
              actualBehavior: 'Server redirects client to arbitrary external destinations specified in user request parameters',
              rootCause: 'Omission of domain/scheme validation prior to triggering HTTP 302 redirect',
              confidenceLevel: 'HIGH',
              impact: 'Facilitates convincing phishing campaigns and credential theft using the legitimate domain as a trampoline',
              recommendedCorrection: 'Validate redirect target: `if (!url.startsWith("/") || url.startsWith("//")) throw new Error("Invalid redirect"); res.redirect(url);`',
              regressionTestRequirements: ['Security test verifying external URLs are rejected from redirection endpoints'],
              repairable: false
            });
          }
        }
      }
    }

    return {
      ruleId: 'SEC-REDIR-001',
      status: findings.length > 0 ? 'FAIL' : 'PASS',
      executionTimeMs: Date.now() - startTime,
      message:
        findings.length > 0
          ? `Found ${findings.length} unvalidated redirect handler(s).`
          : 'All redirect handlers validate destination URLs.',
      findings
    };
  }
};
