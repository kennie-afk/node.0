# What the 2026-27 pharmacy rules require, and what Dawa does and does not do

Sources are the press and trade reports gathered on 2026-10-03 (research file `B-compliance.md`). **No primary legal text was read**:
the government and Kenya Law pages were not reachable, so every line below is "as reported". Do not present this sheet to a pharmacist as
legal advice or as a statement of what the law requires; present it as "what has been reported, and what our software does about it".

| As reported | Source and its caveat | What Dawa does | What Dawa does NOT do |
|---|---|---|---|
| The Health Cabinet Secretary directed all pharmacies, chemists, manufacturers, importers, distributors, wholesalers and health facilities to register afresh from 1 July 2026 on three national platforms: the National Track and Trace System (NTTS), Practice360 (pharmacist licensing) and Facility360 (facility licensing) | kenyans.co.ke, 25 Jun 2026; nairobiwire.com, Jun 2026 (press reports) | Nothing. Registration is done by the pharmacy and the pharmacist on the government platforms | It does not register anyone, and it is not connected to those platforms |
| Compliance with GS1 standards, and capturing and reporting transactions via NLMIS and NTTS | Same | Reads GS1 codes (GTIN, batch, expiry, serial) from a scanned pack and keeps them against every receipt and sale | It does not report to NLMIS or NTTS. **No interface for software has been published to us.** It records what a report would contain and exports it as a CSV in Dawa's own format, which is not an official submission |
| Keeping electronic inventory, distribution, dispensing and utilisation records | Same | Batch-level stock with expiry, FEFO selling, an append-only dispensing record (patient, prescriber, dispenser, batch) per prescription item, a controlled-drug register with a witness, all exportable as CSV | It does not know what format an inspector or the platforms want; it cannot promise a given export will be accepted |
| NTTS went live on 3 August 2026, with a transition to 31 December 2026 (reported as batch-level) and unit-level serialisation from 1 January 2027 | healthcaremea.com, 28 Jul 2026. That article describes the transition as applying to manufacturers and importers; **what retail pharmacies must do, and from when, is not clear from the sources** | Captures serial numbers at receipt and at sale when packs are scanned, and refuses a duplicate or unknown serial at the till | It cannot make a pack carry a code. Packs without one are handled at batch level only |
| Imported medicines must carry a unique identifier (a data matrix) from 1 January 2027 | kenyans.co.ke (report) | Reads that kind of code (GS1 DataMatrix element strings) | It does not verify a serial against the manufacturer or the regulator: it only knows what it has itself received and sold |
| 10,497 registered pharmaceutical premises as of 23 June 2026 | eastleighvoice.co.ke; mixes retail, wholesale and others, retail share unknown | n/a | n/a |
| Penalty for not complying | Sources say only "regulatory action"; no amounts were found | n/a | We do not know the penalty and will not guess one |

## How to talk about it
- Say: "Dawa gives you the batch, expiry and serial records, and the dispensing and controlled-drug records, in one place and on the record. When the government publishes how software connects, an adapter can be written against it and your history replayed."
- Do not say: "Dawa makes you compliant", "Dawa is connected to NTTS", "approved by PPB", or anything about penalties.
- If the regulator ships its own free dispensing or scanning tool, part of this reason to buy disappears. That is the main risk to the product, and it is fair to say so.
