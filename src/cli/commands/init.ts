import * as fs from 'node:fs';
import * as path from 'node:path';
import { createDefaultRuleRegistry } from '../../rules/index.js';
import { FbdConfig, RuleOverrideConfig } from '../../types/index.js';

export interface InitCommandOptions {
  targetPath?: string;
  force?: boolean;
}

/**
 * Builds the starter config from the actual registered rules so that
 * rule IDs and default severities can never drift from the implementation.
 */
export function buildDefaultConfig(): FbdConfig {
  const rules: Record<string, RuleOverrideConfig> = {};
  for (const rule of createDefaultRuleRegistry().getAllRules()) {
    rules[rule.id] = { enabled: true, severity: rule.severity };
  }

  return {
    ignorePaths: ['node_modules', 'dist', 'build', 'coverage', '.git', '.next', '.fbd-backup'],
    strict: false,
    rules
  };
}

export function runInitCommand(options: InitCommandOptions = {}): number {
  const targetDir = path.resolve(options.targetPath || process.cwd());
  const configPath = path.join(targetDir, '.fbdrc.json');

  if (fs.existsSync(configPath) && !options.force) {
    console.error(`❌ Configuration file already exists at ${configPath}. Use --force to overwrite.`);
    return 1;
  }

  try {
    fs.writeFileSync(configPath, JSON.stringify(buildDefaultConfig(), null, 2) + '\n', 'utf8');
    console.log(`✅ Initialized fbd configuration at ${configPath}`);
    console.log('Edit rule "enabled"/"severity" values and "ignorePaths" to customize scans.');
    return 0;
  } catch (err: any) {
    console.error(`❌ Failed to write .fbdrc.json: ${err.message}`);
    return 1;
  }
}
