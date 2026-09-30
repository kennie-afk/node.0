import { DateInput, Input } from '../../../ui';
import { isoToLocalDate, isoToLocalTime, localToISO } from '../lib/dates';

/**
 * Date + time in the viewer's own timezone. The value is the ISO instant the API stores ("" when
 * either half is missing), so nothing downstream does timezone maths.
 */
export function DateTimeInput({ value, onChange, id, ...aria }: { value: string; onChange: (iso: string) => void; id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) {
  const date = value ? isoToLocalDate(value) : '';
  const time = value ? isoToLocalTime(value) : '';
  const set = (d: string, t: string) => onChange(d && t ? localToISO(d, t) : '');
  return (
    <div className="ops-datetime">
      <DateInput {...aria} id={id} value={date} onChange={(d) => set(d, time || '09:00')} />
      <Input type="time" aria-label="Time" value={time} onChange={(e) => set(date, e.target.value)} />
    </div>
  );
}
