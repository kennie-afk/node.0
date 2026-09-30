import { Lock } from 'lucide-react';
import { Notice } from '../../features/ops/components/FormBanner';

/** Shown wherever a confidential note can be read or written, so nobody is surprised by the audit trail. */
export function ConfidentialityNotice({ mode }: { mode: 'read' | 'write' }) {
  return (
    <Notice tone="info" title="Confidential care records">
      <Lock size={10} aria-hidden /> {mode === 'write' ? 'A note marked confidential can be read only by you and by administrators.' : 'Confidential notes can be read only by their author and by administrators.'} Every time a confidential note is opened, the access is recorded in the audit log with your name and the time. Notes from other people that you may not read show as hidden.
    </Notice>
  );
}
