import * as fs from 'node:fs';
import { DiagnosticContext, DiagnosticFinding, DiagnosticRule, RuleExecutionResult } from '../../types/index.js';
import { SafeRepairEngine } from '../../engine/repair.js';

export const missingRequestHeadersRule: DiagnosticRule = {
  id: 'FE-HDR-001',
  name: 'JSON Request Body Missing Content-Type Header',
  category: 'API_CLIENT_CONFIGURATION',
  severity: 'HIGH',
  description: 'Checks for frontend fetch/axios requests sending JSON stringified body without Content-Type: application/json header.',
  applicability: (context: DiagnosticContext) => context.frontendFiles.length > 0,
  repairable: true,
  execute: (context: DiagnosticContext): RuleExecutionResult => {
    const findings: DiagnosticFinding[] = [];

    for (const file of context.frontendFiles) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf8');

      // Check fetch blocks with JSON.stringify(body) but without Content-Type: application/json
      const fetchBlocks = content.split(/fetch\s*\(/);
      for (let idx = 1; idx < fetchBlocks.length; idx++) {
        const block = fetchBlocks[idx]!;
        const blockEnd = block.indexOf(');');
        const blockText = blockEnd !== -1 ? block.substring(0, blockEnd) : block.substring(0, 300);

        if (blockText.includes('JSON.stringify(') && !blockText.toLowerCase().includes('application/json')) {
          const line = content.substring(0, content.indexOf(blockText)).split('\n').length;
          findings.push({
            id: `FINDING-FE-HDR-001-${findings.length + 1}`,
            ruleId: 'FE-HDR-001',
            title: `JSON body serialized without Content-Type: application/json in ${file}`,
            severity: 'HIGH',
            category: 'API_CLIENT_CONFIGURATION',
            affectedComponent: 'Frontend API Client',
            symptoms: [
              'Backend body parser ignores request payload (req.body is empty {} or undefined)',
              'Backend validation errors (HTTP 400 Bad Request or HTTP 422 Unprocessable Entity)'
            ],
            evidence: {
              description: 'fetch call transmits JSON.stringify() without setting Content-Type header',
              locations: [{ filePath: file, line, snippet: blockText.substring(0, 120).trim() }]
            },
            reproductionSteps: [
              `Submit form or mutation sending JSON.stringify() body`,
              `Inspect backend req.body: empty or raw stream because parser was not triggered`
            ],
            expectedBehavior: 'Requests transmitting JSON payloads must include "Content-Type": "application/json"',
            actualBehavior: 'Request header defaults to "text/plain" or browser default, causing backend body-parser to skip parsing',
            rootCause: 'Missing headers configuration in fetch options object',
            confidenceLevel: 'HIGH',
            impact: 'Form submissions and API mutations fail with validation errors',
            recommendedCorrection: 'Add headers: { "Content-Type": "application/json" } to request configuration',
            regressionTestRequirements: ['Assert request outgoing headers include Content-Type: application/json'],
            repairable: true,
            proposedPatch: {
              filePath: file,
              description: 'Add Content-Type: application/json header to fetch options',
              originalText: 'body: JSON.stringify',
              replacementText: "headers: { 'Content-Type': 'application/json' },\n      body: JSON.stringify",
              lineStart: line,
              lineEnd: line
            }
          });
        }
      }
    }

    return {
      ruleId: 'FE-HDR-001',
      status: findings.length === 0 ? 'PASS' : 'FAIL',
      executionTimeMs: 0,
      message: findings.length === 0
        ? 'All JSON request bodies have Content-Type headers declared.'
        : `Detected ${findings.length} request(s) missing Content-Type headers.`,
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
