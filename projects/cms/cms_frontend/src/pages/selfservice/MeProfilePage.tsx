import { useState } from 'react';
import { Button, ErrorState, Field, Input, PageHeader, PageLoader, useQuery } from '../../ui';
import { me, updateProfile, type MeProfile } from '../../api/selfserviceApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { FormBanner, Notice } from '../../features/ops/components/FormBanner';
import { useFormSubmit } from '../../features/ops/components/useFormSubmit';
import { MeTabs } from './MeTabs';
import { NotLinked } from './NotLinked';

export default function MeProfilePage() {
  const profile = useQuery(me, []);
  if (profile.loading && !profile.data) return <PageLoader />;
  if (profile.error && !profile.data) return <ErrorState message={profile.error.message} onRetry={profile.refetch} requestId={profile.error.requestId} />;
  const member = profile.data!.member;
  return (
    <OpsPage>
      <PageHeader title="My details" subtitle="You can change how the church reaches you. Other details are kept by the church office." />
      <MeTabs active="profile" />
      {member ? <Form member={member} onSaved={profile.refetch} /> : <NotLinked />}
    </OpsPage>
  );
}

function Form({ member, onSaved }: { member: NonNullable<MeProfile['member']>; onSaved: () => void }) {
  const { submit, busy, error, fieldError } = useFormSubmit();
  const [phone, setPhone] = useState(member.phoneNumber ?? '');
  const [email, setEmail] = useState(member.email ?? '');
  const [address, setAddress] = useState(member.address ?? '');
  const [city, setCity] = useState(member.city ?? '');
  const [county, setCounty] = useState(member.county ?? '');
  const [postal, setPostal] = useState(member.postalCode ?? '');
  return (
    <form
      className="ui-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const n = (v: string) => v.trim() || null;
        if (await submit(() => updateProfile({ phoneNumber: n(phone), email: n(email), address: n(address), city: n(city), county: n(county), postalCode: n(postal) }), 'Your details were updated.')) onSaved();
      }}
    >
      <FormBanner error={error} />
      <Notice tone="info">{member.firstName} {member.middleName ?? ''} {member.lastName} · member since {member.membershipDate ?? 'unknown'}. To change your name or date of birth, ask the church office.</Notice>
      <div className="ui-form-grid">
        <Field label="Phone" error={fieldError('phoneNumber')}>{(c) => <Input {...c} inputMode="tel" value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} />}</Field>
        <Field label="Email" error={fieldError('email')}>{(c) => <Input {...c} type="email" value={email} maxLength={100} onChange={(e) => setEmail(e.target.value)} />}</Field>
      </div>
      <Field label="Address" error={fieldError('address')}>{(c) => <Input {...c} value={address} maxLength={255} onChange={(e) => setAddress(e.target.value)} />}</Field>
      <div className="ui-form-grid">
        <Field label="Town or city">{(c) => <Input {...c} value={city} maxLength={100} onChange={(e) => setCity(e.target.value)} />}</Field>
        <Field label="County">{(c) => <Input {...c} value={county} maxLength={100} onChange={(e) => setCounty(e.target.value)} />}</Field>
        <Field label="Postal code">{(c) => <Input {...c} value={postal} maxLength={20} onChange={(e) => setPostal(e.target.value)} />}</Field>
      </div>
      <div className="ui-form-actions"><Button type="submit" variant="primary" loading={busy}>Save my details</Button></div>
    </form>
  );
}
