import { z } from 'zod';

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';
export type CheckStatus = 'PASS' | 'FAIL' | 'WARN' | 'SKIP' | 'ERROR';

export type DiagnosticCategory =
  | 'API_CLIENT_CONFIGURATION'
  | 'ENVIRONMENT_CONFIGURATION'
  | 'REQUEST_LIFECYCLE'
  | 'FRONTEND_DATA_HANDLING'
  | 'USER_INTERFACE_INTEGRATION'
  | 'CACHING_STATE_MANAGEMENT'
  | 'ROUTING_HTTP_SEMANTICS'
  | 'REQUEST_VALIDATION'
  | 'RESPONSE_CONTRACTS'
  | 'ERROR_HANDLING'
  | 'DATABASE_DEPENDENCIES'
  | 'AUTHENTICATION_SECURITY'
  | 'API_CONTRACT_VALIDATION'
  | 'END_TO_END_TRACING';

export interface CodeLocation {
  filePath: string;
  line?: number;
  column?: number;
  snippet?: string;
}

export interface DiagnosticEvidence {
  description: string;
  locations?: CodeLocation[];
  observedData?: Record<string, unknown>;
  rawOutput?: string;
  httpStatus?: number;
  url?: string;
  headers?: Record<string, string>;
}

export interface PatchOperation {
  filePath: string;
  description: string;
  originalText: string;
  replacementText: string;
  lineStart?: number;
  lineEnd?: number;
}

export interface DiagnosticFinding {
  id: string;
  ruleId: string;
  title: string;
  severity: Severity;
  category: DiagnosticCategory;
  affectedComponent: string;
  affectedEndpoint?: string;
  symptoms: string[];
  evidence: DiagnosticEvidence;
  reproductionSteps: string[];
  expectedBehavior: string;
  actualBehavior: string;
  rootCause: string;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  impact: string;
  recommendedCorrection: string;
  regressionTestRequirements: string[];
  repairable: boolean;
  proposedPatch?: PatchOperation;
}

export interface RuleExecutionResult {
  ruleId: string;
  status: CheckStatus;
  executionTimeMs: number;
  message: string;
  findings: DiagnosticFinding[];
  error?: string;
}

export interface DiagnosticContext {
  workspaceRoot: string;
  detectedFrameworks: {
    frontend?: string;
    backend?: string;
    apiType?: 'REST' | 'GraphQL' | 'gRPC' | 'Unknown';
    hasOpenApi: boolean;
    openApiPaths?: string[];
  };
  frontendFiles: string[];
  backendFiles: string[];
  envFiles: string[];
  configFiles: string[];
  interactive: boolean;
  authorizationGranted: boolean;
  dryRun: boolean;
  options: {
    categories?: DiagnosticCategory[];
    strict?: boolean;
    verbose?: boolean;
  };
}

export interface DiagnosticRule {
  id: string;
  name: string;
  category: DiagnosticCategory;
  severity: Severity;
  description: string;
  applicability: (context: DiagnosticContext) => boolean;
  execute: (context: DiagnosticContext) => Promise<RuleExecutionResult> | RuleExecutionResult;
  repairable: boolean;
  repair?: (context: DiagnosticContext, finding: DiagnosticFinding) => Promise<boolean> | boolean;
}

export interface DiagnosticRunSummary {
  timestamp: string;
  workspaceRoot: string;
  durationMs: number;
  detectedEnvironment: DiagnosticContext['detectedFrameworks'];
  totalChecks: number;
  passed: number;
  failed: number;
  warned: number;
  skipped: number;
  errored: number;
  findings: DiagnosticFinding[];
  repairsApplied?: {
    findingId: string;
    filePath: string;
    description: string;
    success: boolean;
  }[];
}

// Zod schemas for runtime validation of configurations and machine-readable output
export const DiagnosticFindingSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  title: z.string(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL']),
  category: z.string(),
  affectedComponent: z.string(),
  affectedEndpoint: z.string().optional(),
  symptoms: z.array(z.string()),
  evidence: z.object({
    description: z.string(),
    locations: z.array(z.object({
      filePath: z.string(),
      line: z.number().optional(),
      column: z.number().optional(),
      snippet: z.string().optional()
    })).optional(),
    observedData: z.record(z.string(), z.unknown()).optional(),
    rawOutput: z.string().optional(),
    httpStatus: z.number().optional(),
    url: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional()
  }),
  reproductionSteps: z.array(z.string()),
  expectedBehavior: z.string(),
  actualBehavior: z.string(),
  rootCause: z.string(),
  confidenceLevel: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  impact: z.string(),
  recommendedCorrection: z.string(),
  regressionTestRequirements: z.array(z.string()),
  repairable: z.boolean()
});

export const DiagnosticRunSummarySchema = z.object({
  timestamp: z.string(),
  workspaceRoot: z.string(),
  durationMs: z.number(),
  detectedEnvironment: z.object({
    frontend: z.string().optional(),
    backend: z.string().optional(),
    apiType: z.enum(['REST', 'GraphQL', 'gRPC', 'Unknown']).optional(),
    hasOpenApi: z.boolean(),
    openApiPaths: z.array(z.string()).optional()
  }),
  totalChecks: z.number(),
  passed: z.number(),
  failed: z.number(),
  warned: z.number(),
  skipped: z.number(),
  errored: z.number(),
  findings: z.array(DiagnosticFindingSchema)
});
