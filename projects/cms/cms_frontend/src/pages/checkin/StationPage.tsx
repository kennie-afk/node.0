import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Input, PageHeader, formatDateTime, useKeysetList, useQuery, useToast } from '../../ui';
import { checkIn, getChild, listRooms, listSessions, type Child, type Room, type Session } from '../../api/checkinApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { Notice } from '../../features/ops/components/FormBanner';
import { EventSelect } from '../../features/ops/components/pickers';
import { useDebounced } from '../../features/ops/components/useDebounced';
import { usePolling } from '../../features/ops/components/usePolling';
import { ageInMonths, ageLabel, fillRatio, roomProblem, suggestRoom } from '../../features/ops/lib/rooms';
import { CheckinTabs } from './CheckinTabs';

export default function StationPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const canWrite = can('members:write');
  const [text, setText] = useState('');
  const q = useDebounced(text.trim());
  const found = useKeysetList<Child>('/checkin/children', { q: q || undefined }, { limit: 8, enabled: q.length >= 2 });
  const rooms = useQuery(listRooms, []);
  const inNow = useQuery(() => listSessions({ status: 'IN', limit: 200 }), []);
  const [child, setChild] = useState<Child | null>(null);
  const [roomId, setRoomId] = useState<number | null>(null);
  const [guardianId, setGuardianId] = useState<number | null>(null);
  const [eventId, setEventId] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);

  usePolling(() => {
    rooms.refetch();
    inNow.refetch();
  }, 30_000);

  const pick = async (c: Child) => {
    try {
      const full = await getChild(c.id);
      setChild(full);
      const months = full.ageMonths ?? ageInMonths(full.dateOfBirth);
      setRoomId(suggestRoom(rooms.data ?? [], months)?.id ?? null);
      setGuardianId(full.guardians?.find((g) => g.isAuthorizedPickup)?.id ?? null);
    } catch (failure) {
      toast.error(normalizeError(failure).message);
    }
  };

  const go = async () => {
    if (!child || roomId === null) return;
    setBusy(true);
    try {
      const session = await checkIn({ childId: child.id, roomId, guardianId, eventId: eventId === '' ? null : eventId });
      navigate('/checkin/label', { state: { session, room: rooms.data?.find((r) => r.id === roomId)?.name ?? '' } });
    } catch (failure) {
      toast.error(normalizeError(failure).message);
      rooms.refetch();
    } finally {
      setBusy(false);
    }
  };

  const months = child ? child.ageMonths ?? ageInMonths(child.dateOfBirth) : 0;
  const alreadyIn = child ? inNow.data?.data.find((s) => s.childId === child.id) : undefined;
  const chosen: Room | undefined = rooms.data?.find((r) => r.id === roomId);
  const problem = chosen && child ? roomProblem(chosen, months) : null;

  return (
    <OpsPage>
      <PageHeader title="Children's check-in" subtitle="Find the child, confirm the room and guardian, print the label." actions={canWrite ? <Button to="/checkin/children/new" variant="secondary">Register a child</Button> : undefined} />
      <CheckinTabs active="station" />
      <div className="ops-station">
        <div className="ui-stack">
          <div className="ops-big-input">
            <Input type="search" aria-label="Find a child" placeholder="Type a child's name" autoFocus value={text} onChange={(e) => { setText(e.target.value); setChild(null); }} />
          </div>
          {q.length >= 2 && !child && (
            <div className="ui-stack">
              {found.items.map((c) => (
                <button key={c.id} type="button" className="ops-tap" onClick={() => pick(c)}>
                  <span><strong>{c.firstName} {c.lastName}</strong> <span className="ops-muted">{ageLabel(ageInMonths(c.dateOfBirth))}</span></span>
                  {c.allergies ? <Badge tone="bad">Allergy</Badge> : <span />}
                </button>
              ))}
              {!found.loading && found.items.length === 0 && <EmptyState title="No child found" message="Check the spelling, or register them first." action={canWrite ? <Button to="/checkin/children/new" variant="primary">Register a child</Button> : undefined} />}
            </div>
          )}
          {child && (
            <Card title={`${child.firstName} ${child.lastName}`} subtitle={`${ageLabel(months)} old`} actions={<Button variant="ghost" onClick={() => setChild(null)}>Choose someone else</Button>}>
              <div className="ui-stack">
                {child.allergies && <div className="ops-alert-allergy" role="alert">ALLERGY: {child.allergies}</div>}
                {child.medicalNotes && <Notice tone="warn" title="Medical">{child.medicalNotes}</Notice>}
                {alreadyIn && <Notice tone="bad" title="Already checked in">{child.firstName} is in {alreadyIn.roomName} since {formatDateTime(alreadyIn.checkedInAt)}. Check out first.</Notice>}
                <div>
                  <div className="ui-label">Room</div>
                  <div className="ui-stack">
                    {(rooms.data ?? []).filter((r) => r.isActive).map((r) => {
                      const why = roomProblem(r, months);
                      return (
                        <button key={r.id} type="button" className="ops-tap" aria-pressed={roomId === r.id} disabled={Boolean(why) && roomId !== r.id && (r.present ?? 0) >= r.capacity} onClick={() => setRoomId(r.id)}>
                          <span><strong>{r.name}</strong> <span className="ops-muted">{ageLabel(r.minAgeMonths)}-{ageLabel(r.maxAgeMonths)}</span>{roomId === r.id && why && <span className="ops-muted"> · {why}</span>}</span>
                          <span className="ui-num">{r.present ?? 0}/{r.capacity}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div className="ui-label">Brought by</div>
                  <div className="ui-stack">
                    {(child.guardians ?? []).map((g) => (
                      <button key={g.id} type="button" className="ops-tap" aria-pressed={guardianId === g.id} onClick={() => setGuardianId(g.id)}>
                        <span><strong>{g.name}</strong> <span className="ops-muted">{g.relationship ?? ''} {g.phone ?? ''}</span></span>
                        {g.isAuthorizedPickup ? <Badge tone="ok">Can collect</Badge> : <Badge tone="warn">Drop-off only</Badge>}
                      </button>
                    ))}
                    {(child.guardians ?? []).length === 0 && <Notice tone="warn">No guardians on file. Add one from the child's page so they can collect safely.</Notice>}
                  </div>
                </div>
                <div style={{ maxWidth: 320 }}>
                  <div className="ui-label">Event (optional)</div>
                  <EventSelect value={eventId} onChange={setEventId} placeholder="No specific event" />
                </div>
                {problem && <Notice tone="warn">{problem} The server will refuse if the room cannot take them.</Notice>}
                <div><Button variant="primary" size="md" loading={busy} disabled={!canWrite || roomId === null || Boolean(alreadyIn)} onClick={go}>Check in and print label</Button></div>
              </div>
            </Card>
          )}
        </div>
        <div className="ui-stack">
          <Card title="Rooms now" flush>
            <ul className="ops-list" style={{ padding: '0 12px 8px' }}>
              {(rooms.data ?? []).filter((r) => r.isActive).map((r) => {
                const ratio = fillRatio(r);
                return (
                  <li key={r.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                    <div className="ui-row" style={{ justifyContent: 'space-between' }}><span>{r.name}</span><span className="ui-num">{r.present ?? 0}/{r.capacity}</span></div>
                    <div className={`ops-meter ${ratio >= 1 ? 'is-full' : ratio >= 0.8 ? 'is-near' : ''}`} role="img" aria-label={`${r.name}: ${r.present ?? 0} of ${r.capacity}`}><span style={{ width: `${ratio * 100}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card title={`In the building (${inNow.data?.data.length ?? 0})`} flush>
            {inNow.data && inNow.data.data.length === 0 ? (
              <EmptyState title="Nobody checked in" message="Children appear here until they are collected." />
            ) : (
              <ul className="ops-list" style={{ padding: '0 12px 8px' }}>
                {(inNow.data?.data ?? []).map((s: Session) => (
                  <li key={s.id}>
                    <span>{s.firstName} {s.lastName} <span className="ops-muted">· {s.roomName}</span>{s.allergies ? ' ' : ''}{s.allergies && <Badge tone="bad">Allergy</Badge>}</span>
                    {canWrite && <Button size="sm" variant="secondary" to={`/checkin/sessions/${s.id}/checkout`}>Check out</Button>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </OpsPage>
  );
}
