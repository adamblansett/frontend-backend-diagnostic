#!/usr/bin/env node
import { runScanCommand } from './commands/scan.js';
import { runProbeCommand } from './commands/probe.js';
import { runContractCommand } from './commands/contract.js';
import { runInitCommand } from './commands/init.js';
import { runRollbackCommand } from './commands/rollback.js';
import { DiagnosticCategory } from '../types/index.js';

function printHelp(): void {
  console.log(`
Frontend-Backend Diagnostic (fbd) CLI
A production-quality tool for diagnosing, tracing, and resolving frontend/backend integration failures.

USAGE:
  fbd <command> [options]

COMMANDS:
  scan [path]         Scan workspace for integration defects, CORS errors, URL issues, env leaks, and contract mismatches.
  probe <url>         Perform an active 15-stage live request trace against an endpoint.
  contract [path]     Validate agreement between frontend client calls, backend route definitions, and OpenAPI specs.
  rollback [path]     Restore workspace to the previous safe backup snapshot created during repairs.
  init [path]         Initialize a starter .fbdrc.json configuration file.
  help                Display this help message.

OPTIONS FOR 'scan':
  --format <fmt>      Output format: 'console' (default), 'markdown', 'json', or 'sarif'.
  --output <file>     Write report to the specified file path.
  --fix               Apply safe, verified automated repairs where available.
  --dry-run           Preview unified diffs of proposed repairs without modifying files.
  --categories <cat>  Comma-separated category filters (e.g., API_CLIENT_CONFIGURATION,AUTHENTICATION_SECURITY).
  --ignore <paths>    Comma-separated file path substrings or patterns to ignore.
  --watch             Watch files for changes and re-run diagnostics automatically.
  --strict            Exit with code 1 if any warning, failure, or error is found.
  --verbose           Enable detailed debug logging.

OPTIONS FOR 'probe':
  --method <method>   HTTP method to probe: GET (default), POST, PUT, DELETE.
  --origin <origin>   Custom Origin header for CORS preflight testing (e.g. http://localhost:3000).
  --format <fmt>      Output format: 'console' (default) or 'json'.
  --output <file>     Save probe result trace to file.

OPTIONS FOR 'contract':
  --format <fmt>      Output format: 'console' (default), 'markdown', or 'json'.
  --output <file>     Save contract audit report to file.

OPTIONS FOR 'rollback':
  --backup-id <id>    Specific snapshot directory name to restore (defaults to latest).

OPTIONS FOR 'init':
  --force             Overwrite existing .fbdrc.json file.

EXAMPLES:
  fbd scan .
  fbd scan ./my-project --format markdown --output diagnostic-report.md
  fbd scan ./my-project --format sarif --output results.sarif
  fbd scan ./my-project --dry-run
  fbd scan ./my-project --fix
  fbd scan ./my-project --watch
  fbd rollback ./my-project
  fbd probe http://localhost:3000/api/users --method GET
  fbd contract ./my-project --format markdown
  fbd init
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'scan';

  if (command === 'help' || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  if (command === '--version' || args.includes('-v')) {
    console.log('frontend-backend-diagnostic v1.1.0');
    process.exit(0);
  }

  try {
    if (command === 'scan') {
      const targetPath = args[1] && !args[1].startsWith('--') ? args[1] : undefined;
      const formatIdx = args.indexOf('--format');
      const format = formatIdx !== -1 && args[formatIdx + 1] ? (args[formatIdx + 1] as 'console' | 'markdown' | 'json' | 'sarif') : 'console';
      const outputIdx = args.indexOf('--output');
      const output = outputIdx !== -1 ? args[outputIdx + 1] : undefined;
      const categoriesIdx = args.indexOf('--categories');
      const categories = categoriesIdx !== -1 && args[categoriesIdx + 1]
        ? (args[categoriesIdx + 1]!.split(',') as DiagnosticCategory[])
        : undefined;

      const ignoreIdx = args.indexOf('--ignore');
      const ignore = ignoreIdx !== -1 && args[ignoreIdx + 1]
        ? args[ignoreIdx + 1]!.split(',')
        : undefined;

      const code = await runScanCommand({
        targetPath,
        format,
        output,
        fix: args.includes('--fix'),
        dryRun: args.includes('--dry-run'),
        categories,
        ignore,
        watch: args.includes('--watch'),
        strict: args.includes('--strict'),
        verbose: args.includes('--verbose')
      });
      process.exit(code);
    } else if (command === 'probe') {
      const url = args[1];
      if (!url) {
        console.error('Error: "probe" command requires a URL argument. Example: fbd probe http://localhost:3000/health');
        process.exit(1);
      }
      const methodIdx = args.indexOf('--method');
      const method = methodIdx !== -1 && args[methodIdx + 1] ? (args[methodIdx + 1] as 'GET' | 'POST' | 'PUT' | 'DELETE') : 'GET';
      const originIdx = args.indexOf('--origin');
      const origin = originIdx !== -1 ? args[originIdx + 1] : undefined;
      const formatIdx = args.indexOf('--format');
      const format = formatIdx !== -1 && args[formatIdx + 1] ? (args[formatIdx + 1] as 'console' | 'json') : 'console';
      const outputIdx = args.indexOf('--output');
      const output = outputIdx !== -1 ? args[outputIdx + 1] : undefined;

      const code = await runProbeCommand({ url, method, origin, format, output });
      process.exit(code);
    } else if (command === 'contract') {
      const targetPath = args[1] && !args[1].startsWith('--') ? args[1] : undefined;
      const formatIdx = args.indexOf('--format');
      const format = formatIdx !== -1 && args[formatIdx + 1] ? (args[formatIdx + 1] as 'console' | 'markdown' | 'json') : 'console';
      const outputIdx = args.indexOf('--output');
      const output = outputIdx !== -1 ? args[outputIdx + 1] : undefined;

      const code = await runContractCommand({ targetPath, format, output });
      process.exit(code);
    } else if (command === 'rollback') {
      const targetPath = args[1] && !args[1].startsWith('--') ? args[1] : undefined;
      const backupIdx = args.indexOf('--backup-id');
      const backupId = backupIdx !== -1 ? args[backupIdx + 1] : undefined;

      const code = runRollbackCommand({ targetPath, backupId });
      process.exit(code);
    } else if (command === 'init') {
      const targetPath = args[1] && !args[1].startsWith('--') ? args[1] : undefined;
      const force = args.includes('--force');

      const code = runInitCommand({ targetPath, force });
      process.exit(code);
    } else {
      console.error(`Unknown command: "${command}". Run "fbd --help" for available commands.`);
      process.exit(1);
    }
  } catch (err) {
    console.error('Diagnostic error:', err);
    process.exit(1);
  }
}

main();
