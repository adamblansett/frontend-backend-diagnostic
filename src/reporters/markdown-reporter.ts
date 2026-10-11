import { DiagnosticRunSummary } from '../types/index.js';

export class MarkdownReporter {
  public static generate(summary: DiagnosticRunSummary): string {
    const md: string[] = [];

    // Header
    md.push('# Frontend-Backend Diagnostic Report');
    md.push(`**Generated:** ${summary.timestamp}  `);
    md.push(`**Target Workspace:** \`${summary.workspaceRoot}\`  `);
    md.push(`**Execution Duration:** ${summary.durationMs}ms  `);
    md.push('');

    // 1. Executive Summary
    md.push('## 1. Executive Summary');
    const totalIssues = summary.failed + summary.warned;
    if (totalIssues === 0) {
      md.push('> [!NOTE]');
      md.push('> **Status: HEALTHY**. No integration defects, security misconfigurations, or API contract mismatches were detected.');
    } else {
      const criticalCount = summary.findings.filter((f) => f.severity === 'CRITICAL').length;
      const highCount = summary.findings.filter((f) => f.severity === 'HIGH').length;
      md.push('> [!WARNING]');
      md.push(`> **Diagnostic Findings Detected:** ${summary.failed} failed checks, ${summary.warned} warnings across ${summary.totalChecks} total checks.`);
      if (criticalCount > 0) {
        md.push(`> **CRITICAL Risk:** ${criticalCount} critical issue(s) detected requiring immediate remediation.`);
      }
      if (highCount > 0) {
        md.push(`> **HIGH Risk:** ${highCount} high-severity issue(s) impacting core API communication.`);
      }
    }
    md.push('');

    // 2. Repository and Environment Summary
    md.push('## 2. Repository & Environment Summary');
    md.push('| Parameter | Detected Configuration |');
    md.push('| :--- | :--- |');
    md.push(`| **Frontend Framework** | ${summary.detectedEnvironment.frontend || 'None / Generic'} |`);
    md.push(`| **Backend Framework** | ${summary.detectedEnvironment.backend || 'None / Generic'} |`);
    md.push(`| **API Architecture** | ${summary.detectedEnvironment.apiType || 'REST'} |`);
    md.push(`| **OpenAPI / Swagger Present** | ${summary.detectedEnvironment.hasOpenApi ? 'Yes' : 'No'} |`);
    md.push('');

    // 3. Diagnostic Coverage & Baseline
    md.push('## 3. Diagnostic Execution & Coverage');
    md.push('| Metric | Count |');
    md.push('| :--- | :--- |');
    md.push(`| Total Rules Evaluated | ${summary.totalChecks} |`);
    md.push(`| Passed (PASS) | ${summary.passed} |`);
    md.push(`| Failed (FAIL) | ${summary.failed} |`);
    md.push(`| Warnings (WARN) | ${summary.warned} |`);
    md.push(`| Skipped (SKIP) | ${summary.skipped} |`);
    md.push(`| Diagnostic Errors (ERROR) | ${summary.errored} |`);
    md.push('');

    // 4. Confirmed Findings
    md.push('## 4. Confirmed Findings');
    if (summary.findings.length === 0) {
      md.push('_No confirmed issues found._');
      md.push('');
    } else {
      for (const finding of summary.findings) {
        md.push(`### [${finding.severity}] ${finding.title} (\`${finding.id}\`)`);
        md.push(`- **Rule ID:** \`${finding.ruleId}\``);
        md.push(`- **Category:** \`${finding.category}\``);
        md.push(`- **Affected Component:** ${finding.affectedComponent}`);
        if (finding.affectedEndpoint) {
          md.push(`- **Affected Endpoint:** \`${finding.affectedEndpoint}\``);
        }
        md.push(`- **Confidence Level:** ${finding.confidenceLevel}`);
        md.push('');

        md.push('**Observable Symptoms:**');
        for (const s of finding.symptoms) {
          md.push(`- ${s}`);
        }
        md.push('');

        md.push('**Verifiable Evidence:**');
        md.push(`- ${finding.evidence.description}`);
        if (finding.evidence.locations && finding.evidence.locations.length > 0) {
          for (const loc of finding.evidence.locations) {
            md.push(`  - \`${loc.filePath}\`${loc.line ? ` line ${loc.line}` : ''}`);
            if (loc.snippet) {
              md.push('    ```');
              md.push(`    ${loc.snippet}`);
              md.push('    ```');
            }
          }
        }
        if (finding.evidence.url) {
          md.push(`  - URL: \`${finding.evidence.url}\``);
        }
        if (finding.evidence.httpStatus) {
          md.push(`  - HTTP Status: \`${finding.evidence.httpStatus}\``);
        }
        md.push('');

        md.push('**Reproduction Steps:**');
        for (let i = 0; i < finding.reproductionSteps.length; i++) {
          md.push(`${i + 1}. ${finding.reproductionSteps[i]}`);
        }
        md.push('');

        md.push(`- **Expected Behavior:** ${finding.expectedBehavior}`);
        md.push(`- **Actual Behavior:** ${finding.actualBehavior}`);
        md.push(`- **Root Cause:** ${finding.rootCause}`);
        md.push(`- **User / Business Impact:** ${finding.impact}`);
        md.push(`- **Recommended Correction:** ${finding.recommendedCorrection}`);
        md.push('');

        md.push('**Regression Test Requirements:**');
        for (const req of finding.regressionTestRequirements) {
          md.push(`- ${req}`);
        }
        md.push('');

        if (finding.repairable) {
          md.push('> [!TIP]');
          md.push('> **Safe Automated Repair Available**: This defect has a deterministic patch available via `--fix` mode.');
          md.push('');
        }
        md.push('---');
        md.push('');
      }
    }

    // 5. Security & Contract Findings Highlights
    const secFindings = summary.findings.filter((f) => f.category === 'AUTHENTICATION_SECURITY' || f.category === 'ENVIRONMENT_CONFIGURATION');
    const conFindings = summary.findings.filter((f) => f.category === 'API_CONTRACT_VALIDATION' || f.category === 'RESPONSE_CONTRACTS');

    md.push('## 5. Security & Boundary Highlights');
    if (secFindings.length === 0) {
      md.push('No authentication or credential security boundary issues detected.');
    } else {
      md.push(`Found **${secFindings.length}** security or environment boundary finding(s):`);
      for (const f of secFindings) {
        md.push(`- **${f.severity}**: ${f.title} (${f.id})`);
      }
    }
    md.push('');

    md.push('## 6. API Contract Validation Highlights');
    if (conFindings.length === 0) {
      md.push('No API contract discrepancies detected.');
    } else {
      md.push(`Found **${conFindings.length}** API contract / response schema discrepancy finding(s):`);
      for (const f of conFindings) {
        md.push(`- **${f.severity}**: ${f.title} (${f.id})`);
      }
    }
    md.push('');

    // 7. Repairs Applied (if any)
    if (summary.repairsApplied && summary.repairsApplied.length > 0) {
      md.push('## 7. Automated Repairs Applied (Authorized Mode)');
      md.push('| Finding ID | File | Result | Description |');
      md.push('| :--- | :--- | :--- | :--- |');
      for (const rep of summary.repairsApplied) {
        md.push(`| \`${rep.findingId}\` | \`${rep.filePath}\` | ${rep.success ? 'APPLIED' : 'FAILED'} | ${rep.description} |`);
      }
      md.push('');
    }

    // 8. Prioritized Remediation Plan & Next Actions
    md.push('## 8. Prioritized Remediation Plan');
    if (summary.findings.length === 0) {
      md.push('1. Maintain ongoing CI regression checks.');
      md.push('2. Expand automated contract testing for newly added endpoints.');
    } else {
      const sorted = [...summary.findings].sort((a, b) => {
        const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFORMATIONAL: 4 };
        return (order[a.severity] ?? 5) - (order[b.severity] ?? 5);
      });

      for (let i = 0; i < sorted.length; i++) {
        const f = sorted[i]!;
        md.push(`${i + 1}. **[${f.severity}] ${f.title}**`);
        md.push(`   - Target: \`${f.evidence.locations?.[0]?.filePath || f.affectedComponent}\``);
        md.push(`   - Action: ${f.recommendedCorrection}`);
      }
    }
    md.push('');

    return md.join('\n');
  }
}
