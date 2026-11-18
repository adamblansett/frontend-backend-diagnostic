import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SafeRepairEngine } from '../src/engine/repair.js';
import { PatchOperation } from '../src/types/index.js';

describe('Batch SafeRepairEngine Suite', () => {
  let tmpDir: string;
  let clientFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fbd-batch-repair-test-'));
    clientFile = path.join(tmpDir, 'client.ts');

    const content = [
      "const url1 = '/api/v1//users';",
      "const dummy = 'stay_intact';",
      "const url2 = '/api/v1//orders';",
      "const dummy2 = 'keep_intact';"
    ].join('\n');

    fs.writeFileSync(clientFile, content, 'utf8');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('applies multiple patches on the same file in bottom-up descending line order', () => {
    const patches: PatchOperation[] = [
      {
        filePath: clientFile,
        description: 'Fix url1 double slash',
        originalText: '/api/v1//users',
        replacementText: '/api/v1/users',
        lineStart: 1,
        lineEnd: 1
      },
      {
        filePath: clientFile,
        description: 'Fix url2 double slash',
        originalText: '/api/v1//orders',
        replacementText: '/api/v1/orders',
        lineStart: 3,
        lineEnd: 3
      }
    ];

    const result = SafeRepairEngine.applyBatchPatches(patches, {
      workspaceRoot: tmpDir,
      backup: true
    });

    expect(result.appliedCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(result.backupDir).toBeDefined();
    expect(fs.existsSync(result.backupDir!)).toBe(true);

    const updated = fs.readFileSync(clientFile, 'utf8');
    expect(updated).toContain("const url1 = '/api/v1/users';");
    expect(updated).toContain("const url2 = '/api/v1/orders';");
    expect(updated).not.toContain('//');
  });

  it('can rollback changes using created backup snapshot', () => {
    const patches: PatchOperation[] = [
      {
        filePath: clientFile,
        description: 'Fix url1 double slash',
        originalText: '/api/v1//users',
        replacementText: '/api/v1/users',
        lineStart: 1,
        lineEnd: 1
      }
    ];

    const result = SafeRepairEngine.applyBatchPatches(patches, {
      workspaceRoot: tmpDir,
      backup: true
    });

    expect(result.backupDir).toBeDefined();
    expect(fs.readFileSync(clientFile, 'utf8')).toContain('/api/v1/users');

    // Rollback
    SafeRepairEngine.rollback(result.backupDir!, tmpDir);
    expect(fs.readFileSync(clientFile, 'utf8')).toContain('/api/v1//users');
  });
});
