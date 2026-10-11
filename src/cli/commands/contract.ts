import * as path from 'node:path';
import { ProjectDetector } from '../../detectors/project-detector.js';
import { ContractValidator } from '../../contract/contract-validator.js';

export async function runContractCommand(targetPath?: string): Promise<number> {
  const targetDir = path.resolve(targetPath || process.cwd());
  console.log(`\nValidating API Contract between Frontend and Backend in: ${targetDir}`);

  const context = await ProjectDetector.scanWorkspace(targetDir);
  const backendRoutes = ContractValidator.extractBackendRoutes(context.backendFiles);
  const clientCalls = ContractValidator.extractFrontendCalls(context.frontendFiles);

  console.log(`Discovered ${backendRoutes.length} backend route(s) and ${clientCalls.length} frontend client call(s).\n`);

  const findings = ContractValidator.compareContracts(clientCalls, backendRoutes);

  if (findings.length === 0) {
    console.log('✅ API Contract Verification Passed: No route, method, or response field discrepancies detected.\n');
    return 0;
  }

  console.log(`❌ Found ${findings.length} API Contract Discrepancy(ies):\n`);
  for (const f of findings) {
    console.log(`[${f.severity}] ${f.title}`);
    console.log(`  Endpoint:   ${f.affectedEndpoint}`);
    console.log(`  Symptoms:   ${f.symptoms.join('; ')}`);
    console.log(`  Root Cause: ${f.rootCause}`);
    console.log(`  Fix:        ${f.recommendedCorrection}\n`);
  }

  return 1;
}
