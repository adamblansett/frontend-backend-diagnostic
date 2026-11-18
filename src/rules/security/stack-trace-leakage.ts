import * as fs from 'node:fs';
import { DiagnosticContext, DiagnosticFinding, DiagnosticRule, RuleExecutionResult } from '../../types/index.js';

export const StackTraceLeakageRule: DiagnosticRule = {
  id: 'SEC-LEAK-001',
  name: 'Information Disclosure via Stack Trace Leakage in Error Responses',
  category: 'ERROR_HANDLING',
  severity: 'HIGH',
  description: 'Detects backend error handlers returning internal stack traces or database error structures directly in HTTP responses without production environment guards.',
  applicability: (context: DiagnosticContext) => context.backendFiles.length > 0,
  repairable: false,

  execute: async (context: DiagnosticContext): Promise<RuleExecutionResult> => {
    const startTime = Date.now();
    const findings: DiagnosticFinding[] = [];

    // Matches res.json(...) or res.status(...).json(...) with err.stack or error.stack
    const STACK_LEAK_REGEX = /\.(?:json|send)\s*\(\s*(?:\{[^}]*stack:\s*(?:err|error)\.stack[^}]*\}|(?:err|error)\.stack)/;

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

        if (STACK_LEAK_REGEX.test(line)) {
          // Check if guarded by NODE_ENV check
          const surroundingContext = lines.slice(Math.max(0, i - 4), Math.min(lines.length, i + 4)).join('\n');
          const hasEnvGuard = surroundingContext.includes('NODE_ENV') || surroundingContext.includes('isDev') || surroundingContext.includes('development');

          if (!hasEnvGuard) {
            findings.push({
              id: `FINDING-SEC-LEAK-001-${findings.length + 1}`,
              ruleId: 'SEC-LEAK-001',
              title: `Unconditional stack trace exposure in error response in ${file}:${i + 1}`,
              severity: 'HIGH',
              category: 'ERROR_HANDLING',
              affectedComponent: 'Backend Error Middleware',
              affectedEndpoint: file,
              symptoms: [
                `Error responses transmit raw stack trace on line ${i + 1} without NODE_ENV production check`
              ],
              evidence: {
                description: `Stack trace returned unconditionally in HTTP response`,
                locations: [{ filePath: file, line: i + 1, snippet: line.trim() }]
              },
              reproductionSteps: [
                `Trigger a 500 error against endpoint in ${file}`,
                'Inspect the JSON response body and verify existence of "stack" property with internal file paths'
              ],
              expectedBehavior: 'Stack traces and internal runtime details must never be returned in production environments',
              actualBehavior: 'Server transmits call stack, library versions, and internal filesystem paths in HTTP error responses',
              rootCause: 'Error serialization transmits err.stack without environment-dependent suppression',
              confidenceLevel: 'HIGH',
              impact: 'Exposes operating system paths, module versions, database schemas, and source code line numbers to attackers',
              recommendedCorrection: 'Gate stack trace serialization: `stack: process.env.NODE_ENV === "development" ? err.stack : undefined`',
              regressionTestRequirements: ['Security test verifying stack property is omitted in production error responses'],
              repairable: false
            });
          }
        }
      }
    }

    return {
      ruleId: 'SEC-LEAK-001',
      status: findings.length > 0 ? 'FAIL' : 'PASS',
      executionTimeMs: Date.now() - startTime,
      message:
        findings.length > 0
          ? `Found ${findings.length} error handler(s) leaking stack traces.`
          : 'All error handlers suppress stack traces or guard them behind environment checks.',
      findings
    };
  }
};
