import * as fs from 'node:fs';
import { DiagnosticContext, DiagnosticFinding, DiagnosticRule, RuleExecutionResult } from '../../types/index.js';

export const sensitiveStorageRule: DiagnosticRule = {
  id: 'SEC-STORE-001',
  name: 'Sensitive Credential Stored in Browser Web Storage',
  category: 'AUTHENTICATION_SECURITY',
  severity: 'HIGH',
  description: 'Detects sensitive credentials (JWTs, tokens, passwords, API keys) saved directly in localStorage or sessionStorage, exposing them to XSS exfiltration.',
  applicability: (context: DiagnosticContext) => context.frontendFiles.length > 0,
  repairable: false,
  execute: (context: DiagnosticContext): RuleExecutionResult => {
    const findings: DiagnosticFinding[] = [];
    const storageSetRegex = /(?:localStorage|sessionStorage)\.setItem\s*\(\s*['"`]([^'"`]+)['"`]/g;
    const sensitiveKeyPattern = /token|jwt|auth|secret|password|api_?key/i;

    for (const file of context.frontendFiles) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        let match: RegExpExecArray | null;
        storageSetRegex.lastIndex = 0;

        while ((match = storageSetRegex.exec(line)) !== null) {
          const keyName = match[1]!;
          if (sensitiveKeyPattern.test(keyName)) {
            findings.push({
              id: `FINDING-SEC-STORE-001-${findings.length + 1}`,
              ruleId: 'SEC-STORE-001',
              title: `Sensitive key "${keyName}" persisted in Web Storage in ${file}`,
              severity: 'HIGH',
              category: 'AUTHENTICATION_SECURITY',
              affectedComponent: 'Client Storage',
              symptoms: [
                'Sensitive session or auth credentials stored in unencrypted browser storage',
                'Vulnerable to credential exfiltration via any Cross-Site Scripting (XSS) vulnerability'
              ],
              evidence: {
                description: `localStorage or sessionStorage persists sensitive key "${keyName}"`,
                locations: [{ filePath: file, line: i + 1, snippet: line.trim() }]
              },
              reproductionSteps: [
                `Log into application and inspect localStorage in DevTools Application tab`,
                `Observe plaintext token stored under key "${keyName}"`
              ],
              expectedBehavior: 'Authentication tokens should be stored in HTTP-only, Secure, SameSite cookies or transient memory',
              actualBehavior: `Token stored in client-accessible Web Storage under key "${keyName}"`,
              rootCause: 'Convenience storage pattern used instead of secure HTTP-only cookies',
              confidenceLevel: 'HIGH',
              impact: 'Any XSS vulnerability allows full session hijacking and account takeover',
              recommendedCorrection: 'Migrate token storage to HttpOnly cookies or in-memory React state with refresh tokens',
              regressionTestRequirements: ['Security test verifying tokens are not saved to localStorage'],
              repairable: false
            });
          }
        }
      }
    }

    return {
      ruleId: 'SEC-STORE-001',
      status: findings.length === 0 ? 'PASS' : 'FAIL',
      executionTimeMs: 0,
      message: findings.length === 0
        ? 'No sensitive authentication keys detected in browser Web Storage.'
        : `Detected ${findings.length} sensitive credential(s) persisted in browser Web Storage.`,
      findings
    };
  }
};
