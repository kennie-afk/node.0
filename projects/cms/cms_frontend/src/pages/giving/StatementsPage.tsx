import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Field, PageHeader, Select, type ComboOption } from '../../ui';
import { MemberPicker } from '../../features/finance/components/Selectors';
import { SectionTabs } from '../../features/finance/components/SectionTabs';
import { yearsBack } from '../../features/finance/components/helpers';

export default function StatementsPage() {
  const navigate = useNavigate();
  const [member, setMember] = useState<ComboOption<number> | null>(null);
  const [year, setYear] = useState(String(new Date().getUTCFullYear()));
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Giving statements" subtitle="A printable yearly statement of everything a member has given" />
      <SectionTabs section="giving" active="/giving/statements" />
      <Card>
        <form className="ui-form" onSubmit={(e) => { e.preventDefault(); if (member) navigate(`/giving/statements/${member.value}?year=${year}`); }}>
          <div className="ui-form-grid">
            <Field label="Member" required>{(c) => <MemberPicker {...c} value={member} onChange={setMember} />}</Field>
            <Field label="Year">{(c) => <Select {...c} value={year} onChange={(e) => setYear(e.target.value)}>{yearsBack().map((y) => <option key={y}>{y}</option>)}</Select>}</Field>
          </div>
          <div className="ui-form-actions"><Button type="submit" variant="primary" disabled={!member}>View statement</Button></div>
        </form>
      </Card>
    </div>
  );
}
