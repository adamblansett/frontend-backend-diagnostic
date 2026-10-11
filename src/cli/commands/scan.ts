import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProjectDetector } from '../../detectors/project-detector.js';
import { DiagnosticRunner } from '../../engine/runner.js';
import { createDefaultRuleRegistry } from '../../rules/index.js';
import { MarkdownReporter } from '../../reporters/markdown-reporter.js';
import { JsonReporter } from '../../reporters/json-reporter.js';
import { ConsoleReporter } from '../../reporters/console-reporter.js';
import { SafeRepairEngine } from '../../engine/repair.js';
import { DiagnosticCategory } from '../../types/index.js';

export interface ScanCommandOptions {
  targetPath?: string;
  format?: 'console' | 'markdown' | 'json';
  output?: string;
  fix?: boolean;
  dryRun?: boolean;
  categories?: DiagnosticCategory[];
  strict?: boolean;
  verbose?: boolean;
}

export async function runScanCommand(options: ScanCommandOptions): Promise<number> {
  const targetDir = path.resolve(options.targetPath || process.cwd());
  const registry = createDefaultRuleRegistry();
  const runner = new DiagnosticRunner(registry);

  // 1. Discover workspace & context
  const context = await ProjectDetector.scanWorkspace(targetDir, {
    categories: options.categories,
    strict: options.strict,
    verbose: options.verbose
  });

  context.authorizationGranted = Boolean(options.fix);
  context.dryRun = Boolean(options.dryRun);

  // 2. Execute diagnostic run
  const summary = await runner.run(context);

  // 3. Dry-run diff preview
  if (options.dryRun) {
    const diffs = SafeRepairEngine.generateDiffs(summary.findings);
    if (diffs.length > 0) {
      console.log('\n--- DRY RUN PREVIEW: PROPOSED SAFE REPAIRS ---');
      for (const d of diffs) {
        console.log(`\nFile: ${d.filePath}`);
        console.log(d.diff);
      }
      console.log('\nTo apply these patches, re-run with: fbd scan --fix\n');
    }
  }

  // 4. Output handling
  const format = options.format || 'console';
  if (format === 'markdown') {
    const md = MarkdownReporter.generate(summary);
    if (options.output) {
      fs.writeFileSync(path.resolve(options.output), md, 'utf8');
      console.log(`Report written to ${options.output}`);
    } else {
      console.log(md);
    }
  } else if (format === 'json') {
    const json = JsonReporter.generate(summary);
    if (options.output) {
      fs.writeFileSync(path.resolve(options.output), json, 'utf8');
      console.log(`Report written to ${options.output}`);
    } else {
      console.log(json);
    }
  } else {
    ConsoleReporter.print(summary);
    if (options.output) {
      const md = MarkdownReporter.generate(summary);
      fs.writeFileSync(path.resolve(options.output), md, 'utf8');
      console.log(`Report copy written to ${options.output}`);
    }
  }

  // 5. Exit code: non-zero if critical or strict failures
  if (options.strict && (summary.failed > 0 || summary.errored > 0)) {
    return 1;
  }
  const hasCritical = summary.findings.some((f) => f.severity === 'CRITICAL');
  return hasCritical ? 1 : 0;
}
