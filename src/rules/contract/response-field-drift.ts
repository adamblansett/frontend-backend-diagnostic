import { DiagnosticContext, DiagnosticRule, RuleExecutionResult } from '../../types/index.js';
import { ContractValidator } from '../../contract/contract-validator.js';

export const responseFieldDriftRule: DiagnosticRule = {
  id: 'CON-RSP-001',
  name: 'API Response Schema Drift and Contract Mismatch',
  category: 'RESPONSE_CONTRACTS',
  severity: 'HIGH',
  description: 'Analyzes frontend API consumption against backend route responses and endpoints to detect missing fields, drifted schemas, or HTTP method discrepancies.',
  applicability: (context: DiagnosticContext) =>
    context.frontendFiles.length > 0 && context.backendFiles.length > 0,
  repairable: false,
  execute: (context: DiagnosticContext): RuleExecutionResult => {
    const backendRoutes = ContractValidator.extractBackendRoutes(context.backendFiles);
    const clientCalls = ContractValidator.extractFrontendCalls(context.frontendFiles);

    const findings = ContractValidator.compareContracts(clientCalls, backendRoutes);

    return {
      ruleId: 'CON-RSP-001',
      status: findings.length === 0 ? 'PASS' : 'FAIL',
      executionTimeMs: 0,
      message: findings.length === 0
        ? 'Frontend client calls and backend route contracts are in agreement.'
        : `Detected ${findings.length} API contract mismatch(es).`,
      findings
    };
  }
};
