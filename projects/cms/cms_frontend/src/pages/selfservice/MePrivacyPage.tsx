import { useState } from 'react';
import { Badge, Button, Card, ErrorState, PageHeader, PageLoader, formatDateTime, useQuery, useToast } from '../../ui';
import { CONSENT_PURPOSES, type Consent, type ConsentChannel, type ConsentPurpose } from '../../api/dataopsApi';
import { myConsents, setMyConsent } from '../../api/selfserviceApi';
import { normalizeError } from '../../api/http';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { CHANNEL_LABEL, consentKey, latestConsents, PURPOSE_LABEL } from '../../features/ops/lib/consent';
import { MeTabs } from './MeTabs';
import { isNotLinked } from '../../features/ops/lib/notLinked';
import { NotLinked } from './NotLinked';

const CHANNELS_FOR: Record<ConsentPurpose, ConsentChannel[]> = {
  COMMUNICATIONS: ['SMS', 'EMAIL'],
  DATA_PROCESSING: ['ANY'],
  PHOTOS: ['ANY'],
  GIVING_RECORDS: ['ANY'],
  CHILD_CHECKIN: ['ANY']
};

export default function MePrivacyPage() {
  const consents = useQuery(myConsents, []);
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  if (consents.loading && !consents.data) return <PageLoader />;
  if (isNotLinked(consents.error)) return <OpsPage><PageHeader title="Privacy" /><MeTabs active="privacy" /><NotLinked /></OpsPage>;
  if (consents.error && !consents.data) return <ErrorState message={consents.error.message} onRetry={consents.refetch} requestId={consents.error.requestId} />;
  const records: Consent[] = consents.data ?? [];
  const latest = latestConsents(records);

  const choose = async (purpose: ConsentPurpose, channel: ConsentChannel, granted: boolean) => {
    const key = consentKey(purpose, channel);
    setBusy(key);
    try {
      await setMyConsent({ purpose, channel, granted });
      toast.success(granted ? 'Saved: you agreed.' : 'Saved: you withdrew your agreement.');
      consents.refetch();
    } catch (failure) {
      toast.error(normalizeError(failure).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <OpsPage>
      <PageHeader title="Privacy" subtitle="You decide how the church may use your information. Change your mind whenever you like; each choice is recorded with its date." />
      <MeTabs active="privacy" />
      <Card title="Your choices" flush>
        <ul className="ops-list" style={{ padding: '0 12px' }}>
          {CONSENT_PURPOSES.flatMap((purpose) =>
            CHANNELS_FOR[purpose].map((channel) => {
              const key = consentKey(purpose, channel);
              const current = latest.get(key);
              return (
                <li key={key}>
                  <span>{PURPOSE_LABEL[purpose]}{channel !== 'ANY' ? <span className="ops-muted"> · {CHANNEL_LABEL[channel]}</span> : null}<br /><span className="ops-muted">{current ? `${current.granted ? 'Agreed' : 'Not agreed'} on ${formatDateTime(current.recordedAt)}` : 'No choice recorded yet'}</span></span>
                  <span className="ui-actions">
                    <Button size="sm" variant={current?.granted ? 'primary' : 'secondary'} loading={busy === key} aria-pressed={current?.granted === true} onClick={() => choose(purpose, channel, true)}>I agree</Button>
                    <Button size="sm" variant={current && !current.granted ? 'dangerSolid' : 'secondary'} loading={busy === key} aria-pressed={current?.granted === false} onClick={() => choose(purpose, channel, false)}>I do not agree</Button>
                  </span>
                </li>
              );
            })
          )}
        </ul>
      </Card>
      <Card title="History">
        {records.length === 0 ? <span className="ops-muted">Nothing recorded yet.</span> : (
          <ul className="ops-list">
            {[...records].sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()).map((r) => <li key={r.id}><span>{PURPOSE_LABEL[r.purpose]} <span className="ops-muted">· {CHANNEL_LABEL[r.channel]}</span></span><span><Badge tone={r.granted ? 'ok' : 'bad'}>{r.granted ? 'Agreed' : 'Withdrawn'}</Badge> <span className="ops-muted">{formatDateTime(r.recordedAt)} · {r.source.toLowerCase()}</span></span></li>)}
          </ul>
        )}
      </Card>
    </OpsPage>
  );
}
