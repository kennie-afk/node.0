/**
 * Operator commands for onboarding. Run with `npm run admin -- <command>` (or
 * `node dist/admin/cli.js <command>` inside the image).
 *
 *   signups [status]                         list signup requests
 *   provision <signup-id|latest> [--site NAME] [--till CODE] [--phone NUMBER]
 *   create-org --business NAME --owner NAME --phone NUMBER [--site NAME] [--till CODE]
 *   device:add --org ID --site ID --type flow_meter|camera|... [--bay ID]   register a real device; prints its secret once
 *   messages [N]                             recent outbound messages (read a verification code to relay it)
 *   billing:run                              issue due invoices and refresh statuses now
 *   billing:show <org-id>                    subscription, account number and invoices
 *   billing:pay <org-id> <reference> <KES>   record a payment received outside the callback (idempotent on reference)
 *   billing:unmatched                        payments on the billing shortcode whose account number matched nobody
 *   billing:assign <reference> <org-id>      apply an unmatched payment to an organisation
 *   billing:price <org-id> <KES|none>        agreed per-site price for a 6+ site plan
 *
 * The owner's PIN is generated here, printed once and stored only as a bcrypt hash.
 */
import { closeMigrationPool, closePool } from '../persistence/pool';
import { DEVICE_TYPES, DeviceType, listSignups, provisionFromSignup, provisionOrganisation, ProvisionResult, registerDevice } from './provisioning';
import { recentMessages } from '../notify/provider';
import { assignUnmatched, getBillingView, listUnmatched, recordManualPayment, runBillingCycle, setUnitPriceOverride } from '../billing/service';
import { formatKsh, Cents } from '../domain/money';

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

  if (command === 'device:add') {
    const org = flag(args, 'org');
    const site = flag(args, 'site');
    const type = flag(args, 'type') as DeviceType | undefined;
    if (!org || !site || !type || !DEVICE_TYPES.includes(type)) {
      throw new Error(`usage: device:add --org ID --site ID --type ${DEVICE_TYPES.join('|')} [--bay ID]`);
    }
    const device = await registerDevice(org, { siteId: site, bayId: flag(args, 'bay') ?? null, type });
    console.log(`device id : ${device.id}\nsecret    : ${device.secret}   (shown once - it is not stored)`);
    return;
  }

  if (command === 'messages') {
    for (const message of await recentMessages(Number(args[0] ?? 20))) {
      console.log(`${message.createdAt.toISOString()}  ${message.status.padEnd(7)} ${message.to}  ${message.body}`);
    }
    return;
  }

  if (command === 'billing:run') {
    console.log(JSON.stringify(await runBillingCycle(), null, 2));
    return;
  }

  if (command === 'billing:show') {
    const orgId = args[0];
    if (!orgId) throw new Error('usage: billing:show <org-id>');
    const view = await getBillingView(orgId);
    console.log(`status ${view.status}, covered until ${view.coveredUntil.toISOString()}, account ${view.billingRef}, ${view.billedSites} site(s) at ${formatKsh(view.quote.unitCents as Cents)} = ${formatKsh(view.quote.amountCents as Cents)}/month, credit ${formatKsh(view.creditCents as Cents)}`);
    for (const invoice of view.invoices) {
      console.log(`  ${invoice.number}  ${invoice.status.padEnd(5)} ${formatKsh(invoice.amountCents as Cents)} (paid ${formatKsh(invoice.paidCents as Cents)})  ${invoice.periodStart.toISOString().slice(0, 10)} -> ${invoice.periodEnd.toISOString().slice(0, 10)}`);
    }
    return;
  }

  if (command === 'billing:pay') {
    const [orgId, reference, kes] = args;
    if (!orgId || !reference || !kes || !Number.isFinite(Number(kes))) throw new Error('usage: billing:pay <org-id> <reference> <KES>');
    const outcome = await recordManualPayment(orgId, reference, Math.round(Number(kes) * 100));
    console.log(outcome.duplicate ? 'already recorded, nothing changed' : `recorded; invoice ${outcome.invoicePaid ? 'paid' : 'still open'}; status ${outcome.status}`);
    return;
  }

  if (command === 'billing:unmatched') {
    const rows = await listUnmatched();
    if (rows.length === 0) console.log('no unmatched billing payments');
    for (const row of rows) {
      console.log(`${row.externalRef}  ${formatKsh(row.amountCents as Cents)}  account "${row.reference}"  from ${row.payer ?? '?'}  ${row.receivedAt.toISOString()}${row.assigned ? '  (assigned)' : ''}`);
    }
    return;
  }

  if (command === 'billing:assign') {
    const [reference, orgId] = args;
    if (!reference || !orgId) throw new Error('usage: billing:assign <reference> <org-id>');
    const outcome = await assignUnmatched(reference, orgId);
    console.log(`applied; invoice ${outcome.invoicePaid ? 'paid' : 'still open'}; status ${outcome.status}`);
    return;
  }

  if (command === 'billing:price') {
    const [orgId, kes] = args;
    if (!orgId || !kes) throw new Error('usage: billing:price <org-id> <KES|none>');
    await setUnitPriceOverride(orgId, kes === 'none' ? null : Math.round(Number(kes) * 100));
    console.log('saved');
    return;
  }

  console.log('commands: signups | provision | create-org | messages | billing:run | billing:show | billing:pay | billing:unmatched | billing:assign | billing:price');
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
