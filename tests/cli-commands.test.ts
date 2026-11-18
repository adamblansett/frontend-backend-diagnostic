import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runInitCommand } from '../src/cli/commands/init.js';
import { runRollbackCommand } from '../src/cli/commands/rollback.js';
import { runContractCommand } from '../src/cli/commands/contract.js';

describe('CLI Commands: init, rollback, and contract formatting', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fbd-cli-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('fbd init creates a valid .fbdrc.json file', () => {
    const exitCode = runInitCommand({ targetPath: tempDir });
    expect(exitCode).toBe(0);

    const configPath = path.join(tempDir, '.fbdrc.json');
    expect(fs.existsSync(configPath)).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    expect(parsed.rules['FE-URL-001'].severity).toBe('CRITICAL');
    expect(parsed.rules['FE-TIME-001'].severity).toBe('WARN');
    expect(parsed.ignorePaths).toContain('.fbd-backup');
  });

  it('fbd init rejects overwriting existing config unless force is true', () => {
    runInitCommand({ targetPath: tempDir });
    const failCode = runInitCommand({ targetPath: tempDir, force: false });
    expect(failCode).toBe(1);

    const successCode = runInitCommand({ targetPath: tempDir, force: true });
    expect(successCode).toBe(0);
  });

  it('fbd rollback restores files from the latest snapshot in .fbd-backup', () => {
    const backupDir = path.join(tempDir, '.fbd-backup', '2026-11-18T05-00-00Z');
    fs.mkdirSync(backupDir, { recursive: true });

    // File in backup had original text
    fs.writeFileSync(path.join(backupDir, 'app.ts'), 'original code', 'utf8');

    // Current workspace has modified text
    fs.writeFileSync(path.join(tempDir, 'app.ts'), 'modified code', 'utf8');

    const exitCode = runRollbackCommand({ targetPath: tempDir });
    expect(exitCode).toBe(0);

    const restored = fs.readFileSync(path.join(tempDir, 'app.ts'), 'utf8');
    expect(restored).toBe('original code');
  });

  it('fbd rollback handles missing backup directory gracefully', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fbd-no-backup-'));
    const exitCode = runRollbackCommand({ targetPath: emptyDir });
    expect(exitCode).toBe(1);
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });

  it('fbd contract supports JSON and Markdown output formats', async () => {
    // Scaffold minimal frontend and backend files
    const feDir = path.join(tempDir, 'frontend', 'src');
    const beDir = path.join(tempDir, 'backend', 'src');
    fs.mkdirSync(feDir, { recursive: true });
    fs.mkdirSync(beDir, { recursive: true });

    fs.writeFileSync(
      path.join(feDir, 'client.ts'),
      `export async function getUsers() { return fetch('/api/users').then(r => r.json()); }`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(beDir, 'server.ts'),
      `app.get('/api/users', (req, res) => res.json([{ id: 1, name: "Alice" }]));`,
      'utf8'
    );

    const jsonPath = path.join(tempDir, 'contract.json');
    const exitCodeJson = await runContractCommand({
      targetPath: tempDir,
      format: 'json',
      output: jsonPath
    });

    expect(exitCodeJson).toBe(0);
    expect(fs.existsSync(jsonPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    expect(parsed.stats.backendRoutes).toBe(1);
    expect(parsed.stats.clientCalls).toBe(1);

    const mdPath = path.join(tempDir, 'contract.md');
    const exitCodeMd = await runContractCommand({
      targetPath: tempDir,
      format: 'markdown',
      output: mdPath
    });
    expect(exitCodeMd).toBe(0);
    expect(fs.existsSync(mdPath)).toBe(true);
    const mdContent = fs.readFileSync(mdPath, 'utf8');
    expect(mdContent).toContain('# API Contract Validation Report');
    expect(mdContent).toContain('All API contracts match');
  });
});
