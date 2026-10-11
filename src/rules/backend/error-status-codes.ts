import * as fs from 'node:fs';
import { DiagnosticContext, DiagnosticFinding, DiagnosticRule, RuleExecutionResult } from '../../types/index.js';

export const errorStatusCodesRule: DiagnosticRule = {
  id: 'BE-ERR-001',
  name: 'Error Payload Returned with HTTP 200 OK',
  category: 'ERROR_HANDLING',
  severity: 'HIGH',
  description: 'Detects backend route catch blocks or handlers that return HTTP 200 OK for error payloads, preventing frontend HTTP client error interceptors from activating.',
  applicability: (context: DiagnosticContext) => context.backendFiles.length > 0,
  repairable: false,
  execute: (context: DiagnosticContext): RuleExecutionResult => {
    const findings: DiagnosticFinding[] = [];
    const catchBlockRegex = /catch\s*\([^)]*\)\s*\{([^}]+)\}/g;

    for (const file of context.backendFiles) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf8');

      let match: RegExpExecArray | null;
      while ((match = catchBlockRegex.exec(content)) !== null) {
        const catchBody = match[1]!;

        // Look for res.json({ error: ... }) without res.status(4xx/5xx) or explicit res.status(200).json(...)
        const hasExplicit200Error = /res\.status\s*\(\s*200\s*\)\.json\s*\(\s*\{[^}]*error/i.test(catchBody);
        const hasImplicit200Error = /res\.json\s*\(\s*\{[^}]*(?:error|message:\s*['"`](?:failed|error|internal))/i.test(catchBody) &&
          !catchBody.includes('status(');

        if (hasExplicit200Error || hasImplicit200Error) {
          const line = content.substring(0, match.index).split('\n').length;
          findings.push({
            id: `FINDING-BE-ERR-001-${findings.length + 1}`,
            ruleId: 'BE-ERR-001',
            title: `Backend catch block returns HTTP 200 for error responses in ${file}`,
            severity: 'HIGH',
            category: 'ERROR_HANDLING',
            affectedComponent: 'Backend Error Handling',
            symptoms: [
              'Frontend HTTP interceptors (Axios/Fetch) do not reject the promise because status is 200 OK',
              'Frontend components treat the error payload as successful data, causing runtime undefined property errors or displaying "undefined" to users',
              'Monitoring and telemetry count failing operations as successful 200 OK requests'
            ],
            evidence: {
              description: 'Catch block emits error payload with default HTTP 200 status',
              locations: [{ filePath: file, line, snippet: catchBody.trim() }]
            },
            reproductionSteps: [
              `Trigger failure condition inside route handler in ${file}`,
              `Inspect response: HTTP 200 OK with body { error: ... }`
            ],
            expectedBehavior: 'Server returns appropriate 4xx (client error) or 5xx (server error) HTTP status codes for failures',
            actualBehavior: 'Server returns HTTP 200 with error payload, violating HTTP REST semantics',
            rootCause: 'Omission of res.status(500) before res.json() inside exception handler',
            confidenceLevel: 'HIGH',
            impact: 'Broken frontend error flows, masked telemetry, and silent UI rendering bugs',
            recommendedCorrection: 'Prepend res.status(500) or appropriate HTTP error code before res.json({ error: ... })',
            regressionTestRequirements: [
              'Route integration test asserts error response returns HTTP 500 or 400 status'
            ],
            repairable: false
          });
        }
      }
    }

    return {
      ruleId: 'BE-ERR-001',
      status: findings.length === 0 ? 'PASS' : 'FAIL',
      executionTimeMs: 0,
      message: findings.length === 0
        ? 'Backend error status code handling complies with REST standards.'
        : `Detected ${findings.length} endpoint(s) returning HTTP 200 for errors.`,
      findings
    };
  }
};
