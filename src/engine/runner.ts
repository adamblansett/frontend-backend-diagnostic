import {
  DiagnosticContext,
  DiagnosticFinding,
  DiagnosticRunSummary,
  RuleExecutionResult
} from '../types/index.js';
import { Redactor } from './redactor.js';
import { RuleRegistry } from './registry.js';

export class DiagnosticRunner {
  constructor(private registry: RuleRegistry) {}

  public async run(context: DiagnosticContext): Promise<DiagnosticRunSummary> {
    const startTime = Date.now();
    const allRules = this.registry.getAllRules();
    const results: RuleExecutionResult[] = [];
    const allFindings: DiagnosticFinding[] = [];

    const requestedCategories = context.options.categories;

    let passedCount = 0;
    let failedCount = 0;
    let warnedCount = 0;
    let skippedCount = 0;
    let erroredCount = 0;

    for (const rule of allRules) {
      // Category filter check
      if (requestedCategories && requestedCategories.length > 0 && !requestedCategories.includes(rule.category)) {
        skippedCount++;
        results.push({
          ruleId: rule.id,
          status: 'SKIP',
          executionTimeMs: 0,
          message: `Skipped: category "${rule.category}" not included in filter`,
          findings: []
        });
        continue;
      }

      // Applicability check
      let isApplicable = false;
      try {
        isApplicable = rule.applicability(context);
      } catch (err) {
        erroredCount++;
        results.push({
          ruleId: rule.id,
          status: 'ERROR',
          executionTimeMs: 0,
          message: `Error evaluating applicability: ${String(err)}`,
          findings: [],
          error: String(err)
        });
        continue;
      }

      if (!isApplicable) {
        skippedCount++;
        results.push({
          ruleId: rule.id,
          status: 'SKIP',
          executionTimeMs: 0,
          message: 'Rule conditions not applicable to current workspace',
          findings: []
        });
        continue;
      }

      // Execute rule
      const ruleStart = Date.now();
      try {
        const result = await rule.execute(context);
        const duration = Date.now() - ruleStart;
        result.executionTimeMs = duration;

        // Redact any sensitive information in findings
        const sanitizedFindings = result.findings.map((finding) => this.sanitizeFinding(finding));
        result.findings = sanitizedFindings;

        switch (result.status) {
          case 'PASS':
            passedCount++;
            break;
          case 'FAIL':
            failedCount++;
            allFindings.push(...sanitizedFindings);
            break;
          case 'WARN':
            warnedCount++;
            allFindings.push(...sanitizedFindings);
            break;
          case 'SKIP':
            skippedCount++;
            break;
          case 'ERROR':
            erroredCount++;
            break;
        }

        results.push(result);
      } catch (err) {
        const duration = Date.now() - ruleStart;
        erroredCount++;
        results.push({
          ruleId: rule.id,
          status: 'ERROR',
          executionTimeMs: duration,
          message: `Execution failed: ${String(err)}`,
          findings: [],
          error: String(err)
        });
      }
    }

    // Handle repairs if requested and authorized
    const repairsApplied: {
      findingId: string;
      filePath: string;
      description: string;
      success: boolean;
    }[] = [];

    if (context.authorizationGranted && !context.dryRun) {
      for (const finding of allFindings) {
        if (finding.repairable) {
          const rule = this.registry.getRule(finding.ruleId);
          if (rule && rule.repair) {
            try {
              const success = await rule.repair(context, finding);
              repairsApplied.push({
                findingId: finding.id,
                filePath: finding.proposedPatch?.filePath || 'unknown',
                description: finding.recommendedCorrection,
                success: Boolean(success)
              });
            } catch (err) {
              repairsApplied.push({
                findingId: finding.id,
                filePath: finding.proposedPatch?.filePath || 'unknown',
                description: `Repair error: ${String(err)}`,
                success: false
              });
            }
          }
        }
      }
    }

    const durationMs = Date.now() - startTime;

    return {
      timestamp: new Date().toISOString(),
      workspaceRoot: context.workspaceRoot,
      durationMs,
      detectedEnvironment: context.detectedFrameworks,
      totalChecks: allRules.length,
      passed: passedCount,
      failed: failedCount,
      warned: warnedCount,
      skipped: skippedCount,
      errored: erroredCount,
      findings: allFindings,
      repairsApplied: repairsApplied.length > 0 ? repairsApplied : undefined
    };
  }

  private sanitizeFinding(finding: DiagnosticFinding): DiagnosticFinding {
    return {
      ...finding,
      title: Redactor.redactString(finding.title),
      affectedEndpoint: finding.affectedEndpoint ? Redactor.redactString(finding.affectedEndpoint) : undefined,
      symptoms: finding.symptoms.map((s) => Redactor.redactString(s)),
      expectedBehavior: Redactor.redactString(finding.expectedBehavior),
      actualBehavior: Redactor.redactString(finding.actualBehavior),
      rootCause: Redactor.redactString(finding.rootCause),
      impact: Redactor.redactString(finding.impact),
      recommendedCorrection: Redactor.redactString(finding.recommendedCorrection),
      evidence: {
        description: Redactor.redactString(finding.evidence.description),
        locations: finding.evidence.locations?.map((loc) => ({
          ...loc,
          snippet: loc.snippet ? Redactor.redactString(loc.snippet) : undefined
        })),
        observedData: finding.evidence.observedData
          ? Redactor.redactObject(finding.evidence.observedData)
          : undefined,
        rawOutput: finding.evidence.rawOutput ? Redactor.redactString(finding.evidence.rawOutput) : undefined,
        url: finding.evidence.url ? Redactor.redactString(finding.evidence.url) : undefined,
        headers: finding.evidence.headers
          ? Redactor.redactObject(finding.evidence.headers)
          : undefined,
        httpStatus: finding.evidence.httpStatus
      }
    };
  }
}
