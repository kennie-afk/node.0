import { PoolClient } from 'pg';
import { Batch, Reading, foldToMinute } from './batch';

export interface DeviceIdentity {
  id: string;
  orgId: string;
  siteId: string;
  bayId: string | null;
  secretHash: string;
  lastSequence: number;
}

export async function resolveDevice(
  client: PoolClient,
  deviceId: string
): Promise<DeviceIdentity | null> {
  const { rows } = await client.query(
    `SELECT id, org_id, site_id, bay_id, secret_hash, last_sequence FROM resolve_device($1)`,
    [deviceId]
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    orgId: row.org_id,
    siteId: row.site_id,
    bayId: row.bay_id,
    secretHash: row.secret_hash,
    lastSequence: Number(row.last_sequence)
  };
}

export async function storeReadings(
  client: PoolClient,
  device: DeviceIdentity,
  batch: Batch,
  fresh: Reading[]
): Promise<{ rawStored: number; minutesFolded: number }> {
  if (fresh.length === 0) {
    await touchDevice(client, device, batch, device.lastSequence);
    return { rawStored: 0, minutesFolded: 0 };
  }

  const raw = await client.query(
    `INSERT INTO telemetry (device_id, org_id, site_id, bay_id, ts, metric, value, sequence)
     SELECT $1, $2, $3, $4, entry.ts, entry.metric, entry.value, entry.sequence
       FROM UNNEST($5::timestamptz[], $6::text[], $7::double precision[], $8::bigint[])
            AS entry(ts, metric, value, sequence)
     ON CONFLICT (device_id, ts, metric) DO NOTHING`,
    [
      device.id,
      device.orgId,
      device.siteId,
      device.bayId,
      fresh.map((reading) => reading.ts),
      fresh.map((reading) => reading.metric),
      fresh.map((reading) => reading.value),
      fresh.map((reading) => reading.sequence)
    ]
  );

  const folded = [...foldToMinute(fresh)].map(([key, value]) => {
    const [bucket, metric] = key.split('|');
    return { bucket: bucket!, metric: metric!, total: value.total, samples: value.samples };
  });

  await client.query(
    `INSERT INTO telemetry_minute (org_id, site_id, bay_id, bucket, metric, total, samples)
     SELECT $1, $2, $3, entry.bucket, entry.metric, entry.total, entry.samples
       FROM UNNEST($4::timestamptz[], $5::text[], $6::double precision[], $7::int[])
            AS entry(bucket, metric, total, samples)
     ON CONFLICT (site_id, bucket, metric, bay_key)
     DO UPDATE SET total   = telemetry_minute.total + EXCLUDED.total,
                   samples = telemetry_minute.samples + EXCLUDED.samples`,
    [
      device.orgId,
      device.siteId,
      device.bayId,
      folded.map((entry) => entry.bucket),
      folded.map((entry) => entry.metric),
      folded.map((entry) => entry.total),
      folded.map((entry) => entry.samples)
    ]
  );

  const highest = fresh.reduce(
    (top, reading) => (reading.sequence > top ? reading.sequence : top),
    device.lastSequence
  );
  await touchDevice(client, device, batch, highest);

  return { rawStored: raw.rowCount ?? 0, minutesFolded: folded.length };
}

async function touchDevice(
  client: PoolClient,
  device: DeviceIdentity,
  batch: Batch,
  sequence: number
): Promise<void> {
  await client.query(
    `UPDATE devices
        SET last_seen = now(),
            last_sequence = GREATEST(last_sequence, $2),
            firmware = COALESCE($3, firmware)
      WHERE id = $1`,
    [device.id, sequence, batch.firmware ?? null]
  );
}
