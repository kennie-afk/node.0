import bcrypt from 'bcrypt';
import { withOrg, withoutTenant } from '../persistence/pool';
import { UnauthorizedError } from '../domain/errors';
import { Batch, GapReport, inspectSequences, selectFreshReadings } from './batch';
import { DeviceIdentity, resolveDevice, storeReadings } from './repository';
import { PlateBatch, plateRow } from './plates';

const UNKNOWN_DEVICE_HASH = '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva';

export interface IngestionOutcome {
  accepted: number;
  stored: number;
  duplicates: number;
  minutesFolded: number;
  sequences: GapReport;
}

export async function ingestBatch(
  deviceId: string | undefined,
  deviceSecret: string | undefined,
  batch: Batch
): Promise<IngestionOutcome> {
  const device = await authenticateDevice(deviceId, deviceSecret);

  if (device.id !== batch.deviceId) {
    throw new UnauthorizedError('The batch does not belong to the authenticated device.');
  }

  const sequences = inspectSequences(device.lastSequence, batch.readings);
  const fresh = selectFreshReadings(device.lastSequence, batch.readings);

  const written = await withOrg(device.orgId, (client) =>
    storeReadings(client, device, batch, fresh)
  );

  return {
    accepted: batch.readings.length,
    stored: written.rawStored,
    duplicates: batch.readings.length - fresh.length,
    minutesFolded: written.minutesFolded,
    sequences
  };
}

export async function authenticateDevice(
  deviceId: string | undefined,
  deviceSecret: string | undefined
): Promise<DeviceIdentity> {
  if (!deviceId || !deviceSecret) {
    throw new UnauthorizedError('A device id and device secret are required.');
  }

  const device = isUuid(deviceId)
    ? await withoutTenant((client) => resolveDevice(client, deviceId))
    : null;

  const matches = await bcrypt.compare(deviceSecret, device?.secretHash ?? UNKNOWN_DEVICE_HASH);

  if (!device || !matches) {
    throw new UnauthorizedError('Those device credentials are not valid.');
  }

  return device;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Camera devices report entry and exit captures; they are the "demand" ledger. */
export async function ingestPlates(
  deviceId: string | undefined,
  deviceSecret: string | undefined,
  batch: PlateBatch
): Promise<{ stored: number }> {
  const device = await authenticateDevice(deviceId, deviceSecret);
  if (device.id !== batch.deviceId) {
    throw new UnauthorizedError('The batch does not belong to the authenticated device.');
  }

  const rows = batch.captures.map(plateRow);
  await withOrg(device.orgId, async (client) => {
    await client.query(
      `INSERT INTO plate_captures (org_id, site_id, ts, plate_raw, plate_normalised, confidence, image_key, direction)
       SELECT $1, $2, e.ts, e.raw, e.norm, e.conf, e.image, e.direction
         FROM UNNEST($3::timestamptz[], $4::text[], $5::text[], $6::numeric[], $7::text[], $8::text[])
              AS e(ts, raw, norm, conf, image, direction)`,
      [
        device.orgId,
        device.siteId,
        rows.map((r) => r.ts),
        rows.map((r) => r.raw),
        rows.map((r) => r.normalised),
        rows.map((r) => r.confidence),
        rows.map((r) => r.imageKey),
        rows.map((r) => r.direction)
      ]
    );
    await client.query('UPDATE devices SET last_seen = now() WHERE id = $1', [device.id]);
  });
  return { stored: rows.length };
}
