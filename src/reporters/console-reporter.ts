import { DiagnosticRunSummary } from '../types/index.js';

export class ConsoleReporter {
  public static print(summary: DiagnosticRunSummary): void {
    console.log('\n======================================================');
    console.log('       FRONTEND-BACKEND INTEGRATION DIAGNOSTIC        ');
    console.log('======================================================');
    console.log(`Target:      ${summary.workspaceRoot}`);
    console.log(`Environment: FE: ${summary.detectedEnvironment.frontend || 'None'} | BE: ${summary.detectedEnvironment.backend || 'None'}`);
    console.log(`Duration:    ${summary.durationMs}ms\n`);

    console.log('------------------------------------------------------');
    console.log(`CHECKS: ${summary.totalChecks} Total | ${summary.passed} PASS | ${summary.failed} FAIL | ${summary.warned} WARN | ${summary.skipped} SKIP | ${summary.errored} ERROR`);
    console.log('------------------------------------------------------\n');

    if (summary.findings.length === 0) {
      console.log('✅ All diagnostic integration checks passed cleanly!\n');
      return;
    }

    console.log('FINDINGS:');
    for (const f of summary.findings) {
      const badge = f.severity === 'CRITICAL' ? '🔴 [CRITICAL]' : f.severity === 'HIGH' ? '🟠 [HIGH]' : '🟡 [MEDIUM]';
      console.log(`\n${badge} ${f.title}`);
      console.log(`   ID:         ${f.id}`);
      console.log(`   Component:  ${f.affectedComponent}`);
      if (f.affectedEndpoint) {
        console.log(`   Endpoint:   ${f.affectedEndpoint}`);
      }
      console.log(`   Root Cause: ${f.rootCause}`);
      console.log(`   Fix:        ${f.recommendedCorrection}`);
      if (f.repairable) {
        console.log(`   🛠️  Safe auto-repair available (--fix)`);
      }
    }

    if (summary.repairsApplied && summary.repairsApplied.length > 0) {
      console.log('\n------------------------------------------------------');
      console.log('REPAIRS APPLIED:');
      for (const rep of summary.repairsApplied) {
        console.log(`   ${rep.success ? '✔' : '✖'} ${rep.findingId} -> ${rep.filePath}: ${rep.description}`);
      }
    }

    console.log('\n======================================================\n');
  }
}
