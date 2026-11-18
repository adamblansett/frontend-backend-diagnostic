import * as fs from 'node:fs';
import * as path from 'node:path';

export interface InitCommandOptions {
  targetPath?: string;
  force?: boolean;
}

export function runInitCommand(options: InitCommandOptions = {}): number {
  const targetDir = path.resolve(options.targetPath || process.cwd());
  const configPath = path.join(targetDir, '.fbdrc.json');

  if (fs.existsSync(configPath) && !options.force) {
    console.error(`❌ Configuration file already exists at ${configPath}. Use --force to overwrite.`);
    return 1;
  }

  const defaultConfig = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    ignorePaths: [
      'node_modules',
      'dist',
      '.git',
      'coverage',
      '.next',
      'build',
      '.fbd-backup'
    ],
    rules: {
      'FE-URL-001': { enabled: true, severity: 'CRITICAL' },
      'FE-URL-002': { enabled: true, severity: 'CRITICAL' },
      'FE-TIME-001': { enabled: true, severity: 'WARN' },
      'BE-CORS-001': { enabled: true, severity: 'CRITICAL' },
      'SEC-ENV-001': { enabled: true, severity: 'CRITICAL' },
      'SEC-STORE-001': { enabled: true, severity: 'WARN' },
      'SEC-CSRF-001': { enabled: true, severity: 'WARN' },
      'NET-CACHE-001': { enabled: true, severity: 'WARN' },
      'CON-FIELD-001': { enabled: true, severity: 'CRITICAL' }
    },
    openapi: {
      specPath: ''
    }
  };

  try {
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2) + '\n', 'utf8');
    console.log(`✅ Initialized fbd configuration at ${configPath}`);
    console.log('\nYou can now customize:');
    console.log('  - Rule severities and enabled toggles');
    console.log('  - Custom ignore paths');
    console.log('  - OpenAPI / Swagger spec paths for contract drift validation\n');
    return 0;
  } catch (err: any) {
    console.error(`❌ Failed to write .fbdrc.json: ${err.message}`);
    return 1;
  }
}
