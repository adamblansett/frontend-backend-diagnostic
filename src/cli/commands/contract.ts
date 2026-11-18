import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProjectDetector } from '../../detectors/project-detector.js';
import { ContractValidator } from '../../contract/contract-validator.js';

export interface ContractCommandOptions {
  targetPath?: string;
  format?: 'console' | 'json' | 'markdown';
  output?: string;
}

export async function runContractCommand(options: ContractCommandOptions = {}): Promise<number> {
  const targetDir = path.resolve(options.targetPath || process.cwd());
  const format = options.format || 'console';

  if (format === 'console') {
    console.log(`\nValidating API Contract between Frontend and Backend in: ${targetDir}`);
  }

  const context = await ProjectDetector.scanWorkspace(targetDir);
  const backendRoutes = ContractValidator.extractBackendRoutes(context.backendFiles);
  const clientCalls = ContractValidator.extractFrontendCalls(context.frontendFiles);
  const openApiPaths = context.detectedFrameworks.openApiPaths || [];

  if (format === 'console') {
    console.log(
      `Discovered ${backendRoutes.length} backend route(s), ${clientCalls.length} frontend client call(s), and ${openApiPaths.length} OpenAPI specification(s).\n`
    );
  }

  const findings = ContractValidator.compareContracts(clientCalls, backendRoutes, openApiPaths);

  if (format === 'json') {
    const jsonOutput = JSON.stringify(
      {
        workspace: targetDir,
        timestamp: new Date().toISOString(),
        stats: {
          backendRoutes: backendRoutes.length,
          clientCalls: clientCalls.length,
          openApiSpecs: openApiPaths.length,
          discrepancies: findings.length
        },
        findings
      },
      null,
      2
    );

    if (options.output) {
      fs.writeFileSync(path.resolve(options.output), jsonOutput, 'utf8');
      console.log(`Contract validation JSON written to ${options.output}`);
    } else {
      console.log(jsonOutput);
    }
    return findings.length > 0 ? 1 : 0;
  }

  if (format === 'markdown') {
    let md = `# API Contract Validation Report\n\n`;
    md += `- **Workspace:** \`${targetDir}\`\n`;
    md += `- **Discovered Routes:** ${backendRoutes.length} backend routes, ${clientCalls.length} client calls\n`;
    md += `- **OpenAPI Specs Analyzed:** ${openApiPaths.length}\n`;
    md += `- **Discrepancies:** ${findings.length}\n\n`;

    if (findings.length === 0) {
      md += `✅ **All API contracts match.** No route, method, or response property drift was detected.\n`;
    } else {
      md += `| Severity | Rule ID | Endpoint | Root Cause | Fix |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- |\n`;
      for (const f of findings) {
        md += `| **${f.severity}** | \`${f.ruleId}\` | \`${f.affectedEndpoint}\` | ${f.rootCause.replace(/\|/g, '\\|')} | ${f.recommendedCorrection.replace(/\|/g, '\\|')} |\n`;
      }
    }

    if (options.output) {
      fs.writeFileSync(path.resolve(options.output), md, 'utf8');
      console.log(`Contract report written to ${options.output}`);
    } else {
      console.log(md);
    }
    return findings.length > 0 ? 1 : 0;
  }

  // Console output
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

  if (options.output) {
    fs.writeFileSync(path.resolve(options.output), JSON.stringify(findings, null, 2), 'utf8');
    console.log(`Contract validation report written to ${options.output}`);
  }

  return 1;
}
