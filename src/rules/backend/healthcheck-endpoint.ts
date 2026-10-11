import * as fs from 'node:fs';
import { DiagnosticContext, DiagnosticFinding, DiagnosticRule, RuleExecutionResult } from '../../types/index.js';

export const healthcheckEndpointRule: DiagnosticRule = {
  id: 'BE-HLT-001',
  name: 'Backend Health Check Endpoint Presence',
  category: 'DATABASE_DEPENDENCIES',
  severity: 'MEDIUM',
  description: 'Verifies the presence of a dedicated health check endpoint (/health, /healthz, /status) for load balancers, frontend liveness probes, and monitoring.',
  applicability: (context: DiagnosticContext) => context.backendFiles.length > 0,
  repairable: false,
  execute: (context: DiagnosticContext): RuleExecutionResult => {
    const findings: DiagnosticFinding[] = [];
    let hasHealthEndpoint = false;

    for (const file of context.backendFiles) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf8');

      if (
        content.includes("'/health'") ||
        content.includes('"/health"') ||
        content.includes("'/healthz'") ||
        content.includes('"/healthz"') ||
        content.includes("'/api/health'") ||
        content.includes('"/api/health"') ||
        content.includes("'/status'") ||
        content.includes('"/status"')
      ) {
        hasHealthEndpoint = true;
        break;
      }
    }

    if (!hasHealthEndpoint) {
      findings.push({
        id: `FINDING-BE-HLT-001-01`,
        ruleId: 'BE-HLT-001',
        title: 'Missing dedicated health check endpoint in backend service',
        severity: 'MEDIUM',
        category: 'DATABASE_DEPENDENCIES',
        affectedComponent: 'Backend API Service',
        affectedEndpoint: '/health',
        symptoms: [
          'Frontend diagnostics and container orchestrators (Docker/Kubernetes/Cloud Run) cannot verify backend readiness',
          'Service crashes or database connection drops cannot be diagnosed independently from business routes'
        ],
        evidence: {
          description: 'No /health, /healthz, or /status route found in backend files'
        },
        reproductionSteps: [
          'Send GET request to /health or /healthz',
          'Observe 404 Not Found response'
        ],
        expectedBehavior: 'Backend provides a lightweight /health endpoint returning 200 OK and database connectivity status',
        actualBehavior: 'No health check route exists',
        rootCause: 'Health check route not implemented in backend router',
        confidenceLevel: 'HIGH',
        impact: 'Operational monitoring and automated failover cannot detect backend degradation',
        recommendedCorrection: 'Implement a GET /health route returning { status: "ok", timestamp: ... } and validating DB connectivity',
        regressionTestRequirements: ['GET /health returns 200 OK with status: "ok"'],
        repairable: false
      });
    }

    return {
      ruleId: 'BE-HLT-001',
      status: findings.length === 0 ? 'PASS' : 'WARN',
      executionTimeMs: 0,
      message: findings.length === 0
        ? 'Backend provides an operational health check endpoint.'
        : 'Missing dedicated health check endpoint in backend service.',
      findings
    };
  }
};
