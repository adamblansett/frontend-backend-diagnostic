import * as fs from 'node:fs';
import { DiagnosticContext, DiagnosticFinding, DiagnosticRule, RuleExecutionResult } from '../../types/index.js';

export const missingAbortSignalRule: DiagnosticRule = {
  id: 'FE-TIME-001',
  name: 'API Client Missing Timeout or AbortSignal',
  category: 'REQUEST_LIFECYCLE',
  severity: 'HIGH',
  description: 'Checks frontend fetch and HTTP client calls for missing AbortSignal or timeout configurations, which cause network requests to hang indefinitely on stalled connections.',
  applicability: (context: DiagnosticContext) => context.frontendFiles.length > 0,
  repairable: false,
  execute: (context: DiagnosticContext): RuleExecutionResult => {
    const findings: DiagnosticFinding[] = [];

    for (const file of context.frontendFiles) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;

        // Check fetch calls that don't pass signal in options
        if (line.includes('fetch(')) {
          const surrounding = lines.slice(i, Math.min(lines.length, i + 10)).join('\n');
          if (!surrounding.includes('signal') && !surrounding.includes('AbortController') && !surrounding.includes('timeout')) {
            findings.push({
              id: `FINDING-FE-TIME-001-${findings.length + 1}`,
              ruleId: 'FE-TIME-001',
              title: `Fetch request without AbortSignal or timeout in ${file}`,
              severity: 'HIGH',
              category: 'REQUEST_LIFECYCLE',
              affectedComponent: 'Frontend API Client',
              symptoms: [
                'Network requests hang indefinitely when network connectivity drops or server stalls',
                'Unmounted UI components continue awaiting orphaned responses, causing memory leaks'
              ],
              evidence: {
                description: 'fetch() invoked without AbortSignal or timeout options',
                locations: [{ filePath: file, line: i + 1, snippet: line.trim() }]
              },
              reproductionSteps: [
                `Trigger network call in ${file} line ${i + 1}`,
                'Simulate unresponsive network or delayed gateway response',
                'Observe request does not terminate until browser default timeout'
              ],
              expectedBehavior: 'Requests should configure AbortSignal (e.g. AbortSignal.timeout(5000)) or custom AbortController',
              actualBehavior: 'Request lacks timeout or abort configuration and can hang indefinitely',
              rootCause: 'Omission of AbortSignal / timeout configuration in fetch options',
              confidenceLevel: 'HIGH',
              impact: 'Degrades application responsiveness, blocks subsequent interactions, and leaks memory',
              recommendedCorrection: 'Provide signal: AbortSignal.timeout(10000) or controller.signal to the fetch call',
              regressionTestRequirements: ['Assert request aborts after specified timeout period'],
              repairable: false
            });
          }
        }
      }
    }

    return {
      ruleId: 'FE-TIME-001',
      status: findings.length === 0 ? 'PASS' : 'WARN',
      executionTimeMs: 0,
      message: findings.length === 0
        ? 'All frontend API requests configure timeouts or AbortSignals.'
        : `Detected ${findings.length} request(s) without timeouts or AbortSignals.`,
      findings
    };
  }
};
