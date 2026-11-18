import * as fs from 'node:fs';
import * as path from 'node:path';
import { SafeRepairEngine } from '../../engine/repair.js';

export interface RollbackCommandOptions {
  targetPath?: string;
  backupId?: string;
}

export function runRollbackCommand(options: RollbackCommandOptions = {}): number {
  const targetDir = path.resolve(options.targetPath || process.cwd());
  const backupBase = path.join(targetDir, '.fbd-backup');

  if (!fs.existsSync(backupBase)) {
    console.error(`❌ No backup directory found at ${backupBase}. Nothing to roll back.`);
    return 1;
  }

  const entries = fs.readdirSync(backupBase, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort(); // Lexicographical sort on ISO timestamp strings puts newest last

  if (entries.length === 0) {
    console.error(`❌ No snapshots found inside ${backupBase}.`);
    return 1;
  }

  let selectedBackup = options.backupId;
  if (selectedBackup) {
    // Validate that backupId is a simple single-segment directory name
    if (selectedBackup.includes('..') || selectedBackup.includes('/') || selectedBackup.includes('\\') || path.basename(selectedBackup) !== selectedBackup) {
      console.error(`❌ Invalid backup ID "${selectedBackup}": Path traversal characters are not permitted.`);
      return 1;
    }
  } else {
    selectedBackup = entries[entries.length - 1]; // pick newest
  }

  const backupDir = path.resolve(backupBase, selectedBackup!);
  const resolvedBase = path.resolve(backupBase);
  if (!backupDir.startsWith(resolvedBase + path.sep)) {
    console.error(`❌ Security validation failed: Snapshot path escapes backup directory.`);
    return 1;
  }
  if (!fs.existsSync(backupDir)) {
    console.error(`❌ Snapshot "${selectedBackup}" not found in ${backupBase}. Available snapshots:\n${entries.map((e) => '  - ' + e).join('\n')}`);
    return 1;
  }

  console.log(`\nRolling back workspace to snapshot: ${selectedBackup}...`);
  try {
    SafeRepairEngine.rollback(backupDir, targetDir);
    console.log(`✅ Successfully restored workspace from ${backupDir}.\n`);
    return 0;
  } catch (err: any) {
    console.error(`❌ Rollback failed: ${err.message}`);
    return 1;
  }
}
