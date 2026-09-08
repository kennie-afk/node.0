import bcrypt from 'bcrypt';
import { withOrg, withoutTenant } from '../persistence/pool';
import { UnauthorizedError } from '../domain/errors';
import { Batch, GapReport, inspectSequences, selectFreshReadings } from './batch';
import { DeviceIdentity, resolveDevice, storeReadings } from './repository';

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

async function authenticateDevice(
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
