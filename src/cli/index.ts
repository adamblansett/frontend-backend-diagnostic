#!/usr/bin/env node
import { runScanCommand } from './commands/scan.js';
import { runProbeCommand } from './commands/probe.js';
import { runContractCommand } from './commands/contract.js';
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
  contract [path]     Validate agreement between frontend client calls and backend route definitions.
  help                Display this help message.

OPTIONS FOR 'scan':
  --format <fmt>      Output format: 'console' (default), 'markdown', or 'json'.
  --output <file>     Write report to the specified file path.
  --fix               Apply safe, verified automated repairs where available.
  --dry-run           Preview unified diffs of proposed repairs without modifying files.
  --categories <cat>  Comma-separated category filters (e.g., API_CLIENT_CONFIGURATION,AUTHENTICATION_SECURITY).
  --strict            Exit with code 1 if any warning, failure, or error is found.
  --verbose           Enable detailed debug logging.

EXAMPLES:
  fbd scan .
  fbd scan ./my-project --format markdown --output diagnostic-report.md
  fbd scan ./my-project --dry-run
  fbd scan ./my-project --fix
  fbd probe http://localhost:3000/api/users --method GET
  fbd contract ./my-project
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
    console.log('frontend-backend-diagnostic v1.0.0');
    process.exit(0);
  }

  try {
    if (command === 'scan') {
      const targetPath = args[1] && !args[1].startsWith('--') ? args[1] : undefined;
      const formatIdx = args.indexOf('--format');
      const format = formatIdx !== -1 && args[formatIdx + 1] ? (args[formatIdx + 1] as 'console' | 'markdown' | 'json') : 'console';
      const outputIdx = args.indexOf('--output');
      const output = outputIdx !== -1 ? args[outputIdx + 1] : undefined;
      const categoriesIdx = args.indexOf('--categories');
      const categories = categoriesIdx !== -1 && args[categoriesIdx + 1]
        ? (args[categoriesIdx + 1]!.split(',') as DiagnosticCategory[])
        : undefined;

      const code = await runScanCommand({
        targetPath,
        format,
        output,
        fix: args.includes('--fix'),
        dryRun: args.includes('--dry-run'),
        categories,
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
      const code = await runProbeCommand({ url, method });
      process.exit(code);
    } else if (command === 'contract') {
      const targetPath = args[1] && !args[1].startsWith('--') ? args[1] : undefined;
      const code = await runContractCommand(targetPath);
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
