import * as fs from 'node:fs';
import { DiagnosticContext, DiagnosticFinding, DiagnosticRule, RuleExecutionResult } from '../../types/index.js';

export const silentErrorSwallowingRule: DiagnosticRule = {
  id: 'FE-ERR-001',
  name: 'Silent API Error Swallowing Detection',
  category: 'REQUEST_LIFECYCLE',
  severity: 'HIGH',
  description: 'Detects frontend API client catch blocks or handlers that silently swallow errors without setting error state or logging.',
  applicability: (context: DiagnosticContext) => context.frontendFiles.length > 0,
  repairable: false,
  execute: (context: DiagnosticContext): RuleExecutionResult => {
    const findings: DiagnosticFinding[] = [];
    const emptyCatchRegex = /catch\s*\([^)]*\)\s*\{\s*\}/g;
    const promiseEmptyCatchRegex = /\.catch\s*\(\s*(?:\(\s*\)\s*=>\s*\{\s*\}|\(\s*[a-zA-Z0-9_]+\s*\)\s*=>\s*\{\s*\})\s*\)/g;
    const catchReturnEmptyArrayRegex = /catch\s*\([^)]*\)\s*\{\s*return\s*\[\s*\]\s*;?\s*\}/g;

    for (const file of context.frontendFiles) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf8');

      // Check empty catch blocks
      let match: RegExpExecArray | null;
      while ((match = emptyCatchRegex.exec(content)) !== null) {
        const line = content.substring(0, match.index).split('\n').length;
        findings.push({
          id: `FINDING-FE-ERR-001-${findings.length + 1}`,
          ruleId: 'FE-ERR-001',
          title: `Empty catch block silently swallowing API errors in ${file}`,
          severity: 'HIGH',
          category: 'REQUEST_LIFECYCLE',
          affectedComponent: 'Frontend Error Handling',
          symptoms: [
            'API failures are silently swallowed',
            'UI remains in indeterminate loading state or displays empty state without error notifications'
          ],
          evidence: {
            description: 'Empty catch block found in frontend code',
            locations: [{ filePath: file, line, snippet: match[0] }]
          },
          reproductionSteps: [
            `Simulate API network error or HTTP 500 response`,
            `Observe frontend behavior: no error toast or error state triggered`
          ],
          expectedBehavior: 'Errors should transition UI to an error state or notify telemetry/user',
          actualBehavior: 'Error is silently suppressed without handling',
          rootCause: 'Defensive coding pattern used empty catch block instead of proper error-state dispatcher',
          confidenceLevel: 'HIGH',
          impact: 'Users receive no feedback when operations fail; silent data loss or stale UI state occurs',
          recommendedCorrection: 'Update catch block to set component error state or display error notification',
          regressionTestRequirements: ['Unit test asserting error state is set on rejected promise'],
          repairable: false
        });
      }

      // Check empty promise catch handlers
      while ((match = promiseEmptyCatchRegex.exec(content)) !== null) {
        const line = content.substring(0, match.index).split('\n').length;
        findings.push({
          id: `FINDING-FE-ERR-001-${findings.length + 1}`,
          ruleId: 'FE-ERR-001',
          title: `Promise catch handler silently discarding API error in ${file}`,
          severity: 'HIGH',
          category: 'REQUEST_LIFECYCLE',
          affectedComponent: 'Frontend Error Handling',
          symptoms: [
            'API promise rejection discarded with no-op handler',
            'Pending loading state never cleared'
          ],
          evidence: {
            description: 'No-op .catch(() => {}) handler found on promise',
            locations: [{ filePath: file, line, snippet: match[0] }]
          },
          reproductionSteps: [
            'Simulate rejected API request',
            'Observe unhandled failure state'
          ],
          expectedBehavior: 'Promise catch handler propagates error to state or logger',
          actualBehavior: 'Rejection is silently discarded',
          rootCause: 'Empty arrow function passed to .catch()',
          confidenceLevel: 'HIGH',
          impact: 'Silent failures leave UI unresponsive',
          recommendedCorrection: 'Provide error callback handling rejection',
          regressionTestRequirements: ['Assert error state handled on rejection'],
          repairable: false
        });
      }

      // Check catch return empty array without logging or error state
      while ((match = catchReturnEmptyArrayRegex.exec(content)) !== null) {
        const line = content.substring(0, match.index).split('\n').length;
        findings.push({
          id: `FINDING-FE-ERR-001-${findings.length + 1}`,
          ruleId: 'FE-ERR-001',
          title: `Catch block returning empty fallback without error notification`,
          severity: 'MEDIUM',
          category: 'REQUEST_LIFECYCLE',
          affectedComponent: 'Frontend Error Handling',
          symptoms: [
            'Server crashes or validation failures masquerade as empty result sets',
            'User cannot distinguish between an empty list and a failing backend service'
          ],
          evidence: {
            description: 'Catch block returns [] without setting error indicators',
            locations: [{ filePath: file, line, snippet: match[0] }]
          },
          reproductionSteps: [
            `Trigger backend 500 on data fetch endpoint`,
            `Observe UI displays "No items found" instead of connection error`
          ],
          expectedBehavior: 'UI distinguishes between empty dataset (200 OK) and network/server error',
          actualBehavior: 'Client catches error and returns empty array, masking outage',
          rootCause: 'Fallback default array returned inside catch handler without setting error state',
          confidenceLevel: 'HIGH',
          impact: 'Critical server degradation is masked as lack of data',
          recommendedCorrection: 'Capture error in state or rethrow for application boundary error handling',
          regressionTestRequirements: ['Test asserting rejected API call propagates error to UI'],
          repairable: false
        });
      }
    }

    return {
      ruleId: 'FE-ERR-001',
      status: findings.length === 0 ? 'PASS' : 'FAIL',
      executionTimeMs: 0,
      message: findings.length === 0
        ? 'No silent error swallowing detected in frontend files.'
        : `Detected ${findings.length} silent error swallowing defect(s).`,
      findings
    };
  }
};
