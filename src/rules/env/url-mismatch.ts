import * as fs from 'node:fs';
import { DiagnosticContext, DiagnosticFinding, DiagnosticRule, RuleExecutionResult } from '../../types/index.js';
import { SafeRepairEngine } from '../../engine/repair.js';

export const urlMismatchRule: DiagnosticRule = {
  id: 'ENV-URL-001',
  name: 'Frontend API Base URL and Backend Port Mismatch',
  category: 'ENVIRONMENT_CONFIGURATION',
  severity: 'HIGH',
  description: 'Detects port or hostname discrepancies between frontend environment API base URL and backend listening port.',
  applicability: (context: DiagnosticContext) => context.envFiles.length > 0 && context.backendFiles.length > 0,
  repairable: true,
  execute: (context: DiagnosticContext): RuleExecutionResult => {
    const findings: DiagnosticFinding[] = [];

    // Extract frontend configured API port from env files
    let configuredApiUrl = '';
    let configuredPort: string | undefined;
    let envFileFound = '';
    let envLine = 1;

    for (const file of context.envFiles) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!.trim();
        if (/^(?:NEXT_PUBLIC_API_URL|VITE_API_URL|REACT_APP_API_URL|API_BASE_URL)=/i.test(line)) {
          const val = line.split('=')[1]?.trim();
          if (val) {
            configuredApiUrl = val;
            envFileFound = file;
            envLine = i + 1;
            const matchPort = /:([0-9]{2,5})/.exec(val);
            if (matchPort) {
              configuredPort = matchPort[1];
            }
          }
        }
      }
    }

    if (!configuredPort) {
      return {
        ruleId: 'ENV-URL-001',
        status: 'SKIP',
        executionTimeMs: 0,
        message: 'No explicit port specified in frontend API URL configuration.',
        findings: []
      };
    }

    // Extract backend listen port from backend files or env
    let actualBackendPort: string | undefined;
    let backendFileFound = '';
    let backendLine = 1;

    const listenRegex = /(?:app|server)\.listen\s*\(\s*(?:process\.env\.PORT\s*\|\|\s*)?([0-9]{2,5})/g;
    for (const file of context.backendFiles) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        listenRegex.lastIndex = 0;
        const match = listenRegex.exec(line);
        if (match && match[1]) {
          actualBackendPort = match[1];
          backendFileFound = file;
          backendLine = i + 1;
          break;
        }
      }
      if (actualBackendPort) break;
    }

    if (actualBackendPort && configuredPort !== actualBackendPort) {
      const fixedUrl = configuredApiUrl.replace(`:${configuredPort}`, `:${actualBackendPort}`);
      findings.push({
        id: `FINDING-ENV-URL-001-01`,
        ruleId: 'ENV-URL-001',
        title: `Frontend API URL port (${configuredPort}) mismatches backend listen port (${actualBackendPort})`,
        severity: 'HIGH',
        category: 'ENVIRONMENT_CONFIGURATION',
        affectedComponent: 'Environment Configuration',
        affectedEndpoint: configuredApiUrl,
        symptoms: [
          `All frontend API requests result in ERR_CONNECTION_REFUSED or ECONNREFUSED`,
          `Frontend looks for backend on port ${configuredPort}, but backend listens on port ${actualBackendPort}`
        ],
        evidence: {
          description: `Port discrepancy between frontend env and backend listen call`,
          locations: [
            { filePath: envFileFound, line: envLine, snippet: `API_URL=${configuredApiUrl}` },
            { filePath: backendFileFound, line: backendLine, snippet: `listen(${actualBackendPort})` }
          ],
          observedData: { configuredPort, actualBackendPort }
        },
        reproductionSteps: [
          `Start backend server: listening on port ${actualBackendPort}`,
          `Start frontend client: attempts to connect to ${configuredApiUrl}`,
          `Inspect browser network tab: connection refused to port ${configuredPort}`
        ],
        expectedBehavior: `Frontend API URL port matches backend server port (${actualBackendPort})`,
        actualBehavior: `Frontend targets port ${configuredPort} while backend listens on port ${actualBackendPort}`,
        rootCause: `Frontend environment configuration was not updated after backend port changed or default port changed`,
        confidenceLevel: 'HIGH',
        impact: 'Frontend completely fails to connect to backend service in local or staging environments',
        recommendedCorrection: `Update ${envFileFound} line ${envLine} to set API port to ${actualBackendPort} (${fixedUrl})`,
        regressionTestRequirements: [`Integration test asserting client connects to active backend port`],
        repairable: true,
        proposedPatch: {
          filePath: envFileFound,
          description: `Update API URL port from ${configuredPort} to ${actualBackendPort}`,
          originalText: configuredApiUrl,
          replacementText: fixedUrl,
          lineStart: envLine,
          lineEnd: envLine
        }
      });
    }

    return {
      ruleId: 'ENV-URL-001',
      status: findings.length === 0 ? 'PASS' : 'FAIL',
      executionTimeMs: 0,
      message: findings.length === 0
        ? 'Frontend API environment URL matches backend listen port.'
        : `Detected ${findings.length} port/URL mismatch(es).`,
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
