/**
 * Operator tools. Run as: npm run admin -- <command>
 *
 *   provision <business> <owner name> <phone> [branch name]   create an organisation by hand (prints the PIN once)
 *   reset-pin <phone>                                           a new PIN for someone who forgot theirs (prints it once)
 *   messages                                                    recent outbound messages: how you relay a signup code until a real SMS provider is wired in
 *   billing:pay <org id> <mpesa code> <KES>                     record an M-Pesa payment that did not arrive by itself
 *   billing:unmatched                                           payments made to Dawa's own shortcode with an account number nobody holds
 *   billing:assign <mpesa code> <org id>                        give one of those to an organisation
 *   unclaimed:list                                              M-Pesa money that reached a till nobody had registered
 *   unclaimed:assign <mpesa code> <org id> [branch id]          move one of those into an organisation's till, as a normal payment (safe to repeat)
 *   billing:price <org id> <KES per branch | none>              an agreed per-branch price for organisations on the custom tier
 */
import { closePool, closeMigrationPool } from '../persistence/pool';
import { provisionOrganisation, resetPin } from './provisioning';
import { recentMessages } from '../notify/provider';
import { assignUnmatched, listUnmatched, recordManualPayment, setUnitPriceOverride } from '../billing/service';
import { formatKsh, fromShillings } from '../domain/money';
import { assignUnclaimed, listUnclaimed } from '../mpesa/unclaimed';

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'provision': {
      const [business, owner, phone, branch] = args;
      if (!business || !owner || !phone) throw new Error('usage: provision <business> <owner name> <phone> [branch name]');
      const made = await provisionOrganisation({ businessName: business, ownerName: owner, ownerPhone: phone, branchName: branch });
      console.log(`organisation ${made.orgId}\nowner phone ${made.phone}\nPIN ${made.pin}  (shown once; it is stored only as a hash)`);
      break;
    }
    case 'reset-pin': {
      if (!args[0]) throw new Error('usage: reset-pin <phone>');
      const reset = await resetPin(args[0]);
      console.log(`${reset.phone}  new PIN ${reset.pin}  (shown once)`);
      break;
    }
    case 'messages': {
      for (const m of await recentMessages(20)) console.log(`${m.createdAt.toISOString()}  ${m.status.padEnd(6)} ${m.purpose.padEnd(16)} to ${m.to}\n    ${m.body}`);
      break;
    }
    case 'billing:pay': {
      const [orgId, code, kes] = args;
      if (!orgId || !code || !kes) throw new Error('usage: billing:pay <org id> <mpesa code> <KES>');
      const outcome = await recordManualPayment(orgId, code.toUpperCase(), fromShillings(Number(kes)));
      console.log(outcome.duplicate ? 'already recorded (nothing changed)' : `recorded; invoice paid: ${outcome.invoicePaid}; account is now ${outcome.status}`);
      break;
    }
    case 'billing:unmatched': {
      const rows = await listUnmatched();
      if (rows.length === 0) console.log('none');
      for (const r of rows) console.log(`${r.externalRef}  ${formatKsh(r.amountCents as never)}  account "${r.reference}"  ${r.assigned ? 'assigned' : 'UNASSIGNED'}`);
      break;
    }
    case 'billing:assign': {
      const [code, orgId] = args;
      if (!code || !orgId) throw new Error('usage: billing:assign <mpesa code> <org id>');
      const outcome = await assignUnmatched(code.toUpperCase(), orgId);
      console.log(`assigned; invoice paid: ${outcome.invoicePaid}`);
      break;
    }
    case 'billing:price': {
      const [orgId, kes] = args;
      if (!orgId || !kes) throw new Error('usage: billing:price <org id> <KES per branch | none>');
      await setUnitPriceOverride(orgId, kes === 'none' ? null : fromShillings(Number(kes)));
      console.log('ok');
      break;
    }
    case 'unclaimed:list': {
      const rows = await listUnclaimed({ includeClaimed: args.includes('--all') });
      if (rows.length === 0) console.log('none');
      for (const r of rows) console.log(`${r.externalRef}  ${formatKsh(r.amountCents as never)}  till ${r.shortCode}  account "${r.billRef ?? ''}"  from ${r.payerMsisdn ?? '?'}  ${r.receivedAt.toISOString()}  ${r.claimedByOrg ? `assigned to ${r.claimedByOrg}` : 'UNASSIGNED'}`);
      break;
    }
    case 'unclaimed:assign': {
      const [code, orgId, branchId] = args;
      if (!code || !orgId) throw new Error('usage: unclaimed:assign <mpesa code> <org id> [branch id]');
      const outcome = await assignUnclaimed(code, orgId, branchId);
      console.log(outcome.alreadyAssigned ? 'already in that till (nothing changed)' : outcome.matchedSaleId ? `applied to sale ${outcome.matchedSaleId}` : `now in the branch's unmatched list (branch ${outcome.branchId}) for the manager to assign`);
      break;
    }
    default:
      console.log('commands: provision, reset-pin, messages, billing:pay, billing:unmatched, billing:assign, billing:price, unclaimed:list, unclaimed:assign');
  }
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
