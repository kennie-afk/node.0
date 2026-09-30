import { useCallback } from 'react';
import { Combobox, Select, type ComboOption } from '../../../ui';
import { searchMembers } from '../../../api/givingApi';
import { memberName } from './selectorHelpers';
import { useAccounts, useBankAccounts, useFunds, useGivingTypes, useMinistries } from './lookups';
import type { AccountType } from '../../../api/financeApi';

type SelectProps = {
  value: number | '' | null | undefined;
  onChange: (value: number | null) => void;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
};

const toValue = (raw: string): number | null => (raw === '' ? null : Number(raw));

export function FundSelect({ value, onChange, allowEmpty, emptyLabel = 'Any fund', ...aria }: SelectProps) {
  const { data } = useFunds();
  return (
    <Select value={value ?? ''} onChange={(e) => onChange(toValue(e.target.value))} {...aria}>
      {(allowEmpty || !value) && <option value="">{allowEmpty ? emptyLabel : 'Choose a fund'}</option>}
      {(data ?? []).map((fund) => (
        <option key={fund.id} value={fund.id}>
          {fund.code} · {fund.name}
        </option>
      ))}
    </Select>
  );
}

const TYPE_ORDER: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];
const TYPE_LABEL: Record<AccountType, string> = { ASSET: 'Assets', LIABILITY: 'Liabilities', EQUITY: 'Net assets', INCOME: 'Income', EXPENSE: 'Expenses' };

export function AccountSelect({ value, onChange, types, allowEmpty, emptyLabel = 'Any account', ...aria }: SelectProps & { types?: AccountType[] }) {
  const { data } = useAccounts();
  const groups = TYPE_ORDER.filter((type) => !types || types.includes(type));
  return (
    <Select value={value ?? ''} onChange={(e) => onChange(toValue(e.target.value))} {...aria}>
      {(allowEmpty || !value) && <option value="">{allowEmpty ? emptyLabel : 'Choose an account'}</option>}
      {groups.map((type) => (
        <optgroup key={type} label={TYPE_LABEL[type]}>
          {(data ?? [])
            .filter((account) => account.type === type)
            .map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} · {account.name}
              </option>
            ))}
        </optgroup>
      ))}
    </Select>
  );
}

export function GivingTypeSelect({ value, onChange, allowEmpty, emptyLabel = 'Any type', ...aria }: SelectProps) {
  const { data } = useGivingTypes();
  return (
    <Select value={value ?? ''} onChange={(e) => onChange(toValue(e.target.value))} {...aria}>
      {(allowEmpty || !value) && <option value="">{allowEmpty ? emptyLabel : 'Choose a type'}</option>}
      {(data ?? []).map((type) => (
        <option key={type.id} value={type.id}>
          {type.name}
        </option>
      ))}
    </Select>
  );
}

export function BankAccountSelect({ value, onChange, kinds, allowEmpty, emptyLabel = 'Any account', ...aria }: SelectProps & { kinds?: string[] }) {
  const { data } = useBankAccounts();
  return (
    <Select value={value ?? ''} onChange={(e) => onChange(toValue(e.target.value))} {...aria}>
      {(allowEmpty || !value) && <option value="">{allowEmpty ? emptyLabel : 'Choose an account'}</option>}
      {(data ?? [])
        .filter((account) => account.isActive && (!kinds || kinds.includes(account.kind)))
        .map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
    </Select>
  );
}

export function MinistrySelect({ value, onChange, ...aria }: SelectProps) {
  const { data } = useMinistries();
  return (
    <Select value={value ?? ''} onChange={(e) => onChange(toValue(e.target.value))} {...aria}>
      <option value="">No ministry</option>
      {(data ?? []).map((ministry) => (
        <option key={ministry.id} value={ministry.id}>
          {ministry.name}
        </option>
      ))}
    </Select>
  );
}

/** Picks a member. The value is the option (id + label) so the chosen name stays visible. */
export function MemberPicker({
  value,
  onChange,
  placeholder = 'Search members by name or phone',
  ...aria
}: {
  value: ComboOption<number> | null;
  onChange: (option: ComboOption<number> | null) => void;
  placeholder?: string;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const search = useCallback(async (text: string) => {
    const rows = await searchMembers(text);
    return rows.map((m) => ({ value: m.id, label: memberName(m), meta: m.phoneNumber ?? m.email ?? undefined }));
  }, []);
  return <Combobox<number> search={search} value={value} onChange={onChange} placeholder={placeholder} {...aria} />;
}

