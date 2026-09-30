/**
 * Operator commands for onboarding. Run with `npm run admin -- <command>` (or
 * `node dist/admin/cli.js <command>` inside the image).
 *
 *   signups [status]                         list signup requests
 *   provision <signup-id|latest> [--site NAME] [--till CODE] [--phone NUMBER]
 *   create-org --business NAME --owner NAME --phone NUMBER [--site NAME] [--till CODE]
 *
 * The owner's PIN is generated here, printed once and stored only as a bcrypt hash.
 */
import { closeMigrationPool, closePool } from '../persistence/pool';
import { listSignups, provisionFromSignup, provisionOrganisation, ProvisionResult } from './provisioning';

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

function printCredentials(result: ProvisionResult, business: string): void {
  const line = '-'.repeat(58);
  console.log(`\n${line}\n  ${business} is ready\n${line}`);
  console.log(`  organisation id : ${result.orgId}`);
  console.log(`  first site id   : ${result.siteId}`);
  console.log(`  sign in phone   : ${result.phone}`);
  console.log(`  sign in PIN     : ${result.pin}${result.pinWasGenerated ? '   (shown once - it is not stored)' : ''}`);
  console.log(`${line}\n`);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (command === 'signups') {
    const rows = await listSignups(args[0]);
    if (rows.length === 0) {
      console.log('no signup requests');
    }
    for (const row of rows) {
      console.log(
        `${row.id}  ${row.status.padEnd(10)} ${row.businessName} - ${row.contactName} ${row.phone} (${row.siteCount} site${row.siteCount === 1 ? '' : 's'})`
      );
    }
    return;
  }

  if (command === 'provision') {
    const target = args[0];
    if (!target) {
      throw new Error('usage: provision <signup-id|latest> [--site NAME] [--till CODE] [--phone NUMBER]');
    }
    const result = await provisionFromSignup(target, {
      siteName: flag(args, 'site'),
      tillNumber: flag(args, 'till'),
      ownerPhone: flag(args, 'phone')
    });
    printCredentials(result, result.signup.businessName);
    return;
  }

  if (command === 'create-org') {
    const business = flag(args, 'business');
    const owner = flag(args, 'owner');
    const phone = flag(args, 'phone');
    if (!business || !owner || !phone) {
      throw new Error('usage: create-org --business NAME --owner NAME --phone NUMBER [--site NAME] [--till CODE]');
    }
    const result = await provisionOrganisation({
      businessName: business,
      ownerName: owner,
      ownerPhone: phone,
      siteName: flag(args, 'site'),
      tillNumber: flag(args, 'till')
    });
    printCredentials(result, business);
    return;
  }

  console.log('commands: signups [status] | provision <signup-id|latest> | create-org --business --owner --phone');
  process.exitCode = command ? 1 : 0;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => undefined);
    await closeMigrationPool().catch(() => undefined);
  });
