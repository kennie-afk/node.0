/**
 * Checks an exported chain head against the database.
 *
 *   node -r module-alias/register dist/scripts/verify-chain-head.js --church 7 --file head.json
 *   node -r module-alias/register dist/scripts/verify-chain-head.js --church 7            (latest in the object store)
 *
 * Exit 0: the database still holds the exported hashes. Exit 1: history changed. Exit 2: usage or
 * a missing export. Run it from a machine the database owner does not control for it to mean much.
 */
import 'module-alias/register';
import { readFileSync } from 'node:fs';
import db from '@models';
import { requestTx } from '../common/http';
import { runAsTenant } from '../common/tenant-run';
import { checkHeadAgainstDatabase, loadExportedHead, type ChainHead } from '../modules/finance/chain-head';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const churchId = Number(arg('church'));
  if (!Number.isInteger(churchId) || churchId <= 0) {
    console.error('usage: verify-chain-head --church <id> [--file head.json]');
    return 2;
  }
  const file = arg('file');
  const stored: ChainHead | null = file ? (JSON.parse(readFileSync(file, 'utf8')) as ChainHead) : await loadExportedHead(churchId);
  if (!stored) {
    console.error('no exported head found');
    return 2;
  }
  const result = await runAsTenant(churchId, async () => {
    return checkHeadAgainstDatabase(await requestTx(), churchId, stored);
  });
  if (result.ok) {
    console.log(`OK: church ${churchId} still matches the head exported ${stored.takenAt} (ledger entry ${stored.ledger.entries}, audit event ${stored.audit.events})`);
    return 0;
  }
  for (const issue of result.issues) console.error(`MISMATCH: ${issue}`);
  return 1;
}

main()
  .then(async (code) => {
    await db.sequelize.close();
    process.exit(code);
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await db.sequelize.close().catch(() => undefined);
    process.exit(2);
  });
