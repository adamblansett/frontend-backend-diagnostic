import * as fs from 'node:fs';
import { DiagnosticContext, DiagnosticFinding, DiagnosticRule, RuleExecutionResult } from '../../types/index.js';
import { SafeRepairEngine } from '../../engine/repair.js';

export const exposedClientSecretsRule: DiagnosticRule = {
  id: 'ENV-SEC-001',
  name: 'Client Environment Variable Secret Exposure',
  category: 'ENVIRONMENT_CONFIGURATION',
  severity: 'CRITICAL',
  description: 'Detects private server secrets (database credentials, private keys, API secrets) erroneously prefixed with client-exposed prefixes (NEXT_PUBLIC_, VITE_, REACT_APP_) which are bundled into public browser JS.',
  applicability: (context: DiagnosticContext) => context.envFiles.length > 0,
  repairable: true,
  execute: (context: DiagnosticContext): RuleExecutionResult => {
    const findings: DiagnosticFinding[] = [];
    const sensitiveKeywordRegex = /secret|private|database_url|db_password|signing_key|service_key/i;
    const clientPrefixRegex = /^(NEXT_PUBLIC_|VITE_|REACT_APP_)([A-Z0-9_]+)/;

    for (const file of context.envFiles) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!.trim();
        if (!line || line.startsWith('#')) continue;

        const [keyPart] = line.split('=');
        const key = keyPart?.trim() ?? '';

        const prefixMatch = clientPrefixRegex.exec(key);
        if (prefixMatch && prefixMatch[2]) {
          const varNameWithoutPrefix = prefixMatch[2];
          if (sensitiveKeywordRegex.test(varNameWithoutPrefix)) {
            const prefix = prefixMatch[1]!;
            const safeKey = varNameWithoutPrefix;

            findings.push({
              id: `FINDING-ENV-SEC-001-${findings.length + 1}`,
              ruleId: 'ENV-SEC-001',
              title: `Server secret exposed to browser via "${prefix}" prefix: ${key}`,
              severity: 'CRITICAL',
              category: 'ENVIRONMENT_CONFIGURATION',
              affectedComponent: 'Client Build Environment',
              symptoms: [
                `Bundler bundles secret credential into client-side JavaScript bundle`,
                `Any browser user or attacker can read the secret from client source/network tab`
              ],
              evidence: {
                description: `Publicly prefixed environment variable contains sensitive keyword`,
                locations: [{ filePath: file, line: i + 1, snippet: `${key}=[REDACTED_SECRET]` }]
              },
              reproductionSteps: [
                `Build the frontend application (e.g., npm run build)`,
                `Search client bundle in .next/static or dist/ for the secret value`,
                `Observe the credential in plain text within public JavaScript`
              ],
              expectedBehavior: 'Server-side secrets must omit client-exposed prefixes so they remain only in backend runtime',
              actualBehavior: `Secret prefixed with "${prefix}", causing bundler to embed it in client distribution files`,
              rootCause: 'Confusion over frontend environment prefixes resulted in assigning public prefix to a backend secret',
              confidenceLevel: 'HIGH',
              impact: 'Critical credential leakage enabling unauthorized database access, privilege escalation, or third-party service abuse',
              recommendedCorrection: `Rename ${key} to ${safeKey} in ${file} and ensure it is accessed solely by server-side code`,
              regressionTestRequirements: [
                `CI security check verifying no client bundles contain secret strings`
              ],
              repairable: true,
              proposedPatch: {
                filePath: file,
                description: `Remove public prefix from secret key "${key}"`,
                originalText: key,
                replacementText: safeKey,
                lineStart: i + 1,
                lineEnd: i + 1
              }
            });
          }
        }
      }
    }

    return {
      ruleId: 'ENV-SEC-001',
      status: findings.length === 0 ? 'PASS' : 'FAIL',
      executionTimeMs: 0,
      message: findings.length === 0
        ? 'No sensitive server credentials found in client-exposed environment variables.'
        : `Detected ${findings.length} critical secret exposure(s) in client environment configuration.`,
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
