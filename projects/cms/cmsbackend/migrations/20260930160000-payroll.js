'use strict';

const { enableTenantRls } = require('../migrations-lib/tenant');

const TABLES = ['employees', 'staff_advances', 'payroll_runs', 'payslips', 'statutory_remittances'];

/**
 * Payroll. Composite foreign keys keep an employee, run or payslip inside one church; a partial
 * unique index allows one live run per month (a voided run frees the month); row-level security
 * is on for every table. Salary and identity data is exactly what RLS exists to protect.
 */
module.exports = {
  async up(queryInterface) {
    const qi = queryInterface;
    await qi.sequelize.transaction(async (transaction) => {
      const q = (sql) => qi.sequelize.query(sql, { transaction });

      await q(`
        CREATE TABLE employees (
          id serial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          member_id integer,
          full_name varchar(150) NOT NULL,
          national_id varchar(20),
          kra_pin varchar(15),
          nssf_no varchar(20),
          shif_no varchar(20),
          email varchar(120),
          phone varchar(20),
          bank_name varchar(80),
          bank_account varchar(40),
          mpesa_phone varchar(20),
          job_title varchar(100),
          basic_salary_minor bigint NOT NULL DEFAULT 0 CHECK (basic_salary_minor >= 0),
          allowances jsonb NOT NULL DEFAULT '[]'::jsonb,
          deductions jsonb NOT NULL DEFAULT '[]'::jsonb,
          insurance_premium_minor bigint NOT NULL DEFAULT 0 CHECK (insurance_premium_minor >= 0),
          fund_id bigint,
          ministry_id integer,
          status varchar(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
          start_date date NOT NULL,
          end_date date,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (church_id, id),
          FOREIGN KEY (church_id, member_id) REFERENCES members (church_id, id),
          FOREIGN KEY (church_id, fund_id) REFERENCES funds (church_id, id),
          FOREIGN KEY (church_id, ministry_id) REFERENCES ministries (church_id, id)
        )`);
      await q(`CREATE UNIQUE INDEX employees_church_kra_pin_unique ON employees (church_id, kra_pin) WHERE kra_pin IS NOT NULL`);
      await q(`CREATE INDEX employees_status ON employees (church_id, status, full_name)`);

      await q(`
        CREATE TABLE staff_advances (
          id serial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          employee_id integer NOT NULL,
          amount_minor bigint NOT NULL CHECK (amount_minor > 0),
          monthly_recovery_minor bigint NOT NULL CHECK (monthly_recovery_minor > 0),
          recovered_minor bigint NOT NULL DEFAULT 0 CHECK (recovered_minor >= 0 AND recovered_minor <= amount_minor),
          status varchar(10) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLEARED')),
          issued_date date NOT NULL,
          entry_id bigint,
          note varchar(255),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (church_id, id),
          FOREIGN KEY (church_id, employee_id) REFERENCES employees (church_id, id),
          FOREIGN KEY (church_id, entry_id) REFERENCES journal_entries (church_id, id)
        )`);
      await q(`CREATE INDEX staff_advances_employee ON staff_advances (church_id, employee_id, status)`);

      await q(`
        CREATE TABLE payroll_runs (
          id serial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          year smallint NOT NULL,
          month smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
          status varchar(12) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','CALCULATED','APPROVED','POSTED','PAID','VOID')),
          rate_version varchar(20),
          created_by integer,
          calculated_by integer,
          approved_by integer,
          approved_at timestamptz,
          posted_entry_id bigint,
          paid_entry_id bigint,
          paid_date date,
          void_reason varchar(300),
          employee_count integer NOT NULL DEFAULT 0,
          gross_minor bigint NOT NULL DEFAULT 0,
          paye_minor bigint NOT NULL DEFAULT 0,
          nssf_employee_minor bigint NOT NULL DEFAULT 0,
          nssf_employer_minor bigint NOT NULL DEFAULT 0,
          shif_minor bigint NOT NULL DEFAULT 0,
          housing_employee_minor bigint NOT NULL DEFAULT 0,
          housing_employer_minor bigint NOT NULL DEFAULT 0,
          other_deductions_minor bigint NOT NULL DEFAULT 0,
          advance_recovery_minor bigint NOT NULL DEFAULT 0,
          net_minor bigint NOT NULL DEFAULT 0,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (church_id, id),
          FOREIGN KEY (church_id, posted_entry_id) REFERENCES journal_entries (church_id, id),
          FOREIGN KEY (church_id, paid_entry_id) REFERENCES journal_entries (church_id, id)
        )`);
      await q(`CREATE UNIQUE INDEX payroll_runs_one_live_per_month ON payroll_runs (church_id, year, month) WHERE status <> 'VOID'`);
      await q(`CREATE INDEX payroll_runs_period ON payroll_runs (church_id, year DESC, month DESC)`);

      await q(`
        CREATE TABLE payslips (
          id serial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          run_id integer NOT NULL,
          employee_id integer NOT NULL,
          fund_id bigint NOT NULL,
          ministry_id integer,
          employee_name varchar(150) NOT NULL,
          kra_pin varchar(15),
          nssf_no varchar(20),
          shif_no varchar(20),
          pay_method varchar(10) NOT NULL DEFAULT 'BANK',
          pay_to varchar(60),
          basic_minor bigint NOT NULL DEFAULT 0,
          taxable_allowances_minor bigint NOT NULL DEFAULT 0,
          non_taxable_allowances_minor bigint NOT NULL DEFAULT 0,
          gross_minor bigint NOT NULL DEFAULT 0,
          nssf_employee_minor bigint NOT NULL DEFAULT 0,
          nssf_employer_minor bigint NOT NULL DEFAULT 0,
          shif_minor bigint NOT NULL DEFAULT 0,
          housing_employee_minor bigint NOT NULL DEFAULT 0,
          housing_employer_minor bigint NOT NULL DEFAULT 0,
          taxable_pay_minor bigint NOT NULL DEFAULT 0,
          paye_before_relief_minor bigint NOT NULL DEFAULT 0,
          personal_relief_minor bigint NOT NULL DEFAULT 0,
          insurance_relief_minor bigint NOT NULL DEFAULT 0,
          paye_minor bigint NOT NULL DEFAULT 0,
          other_deductions_minor bigint NOT NULL DEFAULT 0,
          advance_recovery_minor bigint NOT NULL DEFAULT 0,
          net_minor bigint NOT NULL DEFAULT 0,
          detail jsonb NOT NULL DEFAULT '{}'::jsonb,
          UNIQUE (church_id, run_id, employee_id),
          FOREIGN KEY (church_id, run_id) REFERENCES payroll_runs (church_id, id) ON DELETE CASCADE,
          FOREIGN KEY (church_id, employee_id) REFERENCES employees (church_id, id),
          FOREIGN KEY (church_id, fund_id) REFERENCES funds (church_id, id)
        )`);
      await q(`CREATE INDEX payslips_employee ON payslips (church_id, employee_id, run_id)`);

      await q(`
        CREATE TABLE statutory_remittances (
          id serial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          run_id integer NOT NULL,
          kind varchar(20) NOT NULL CHECK (kind IN ('PAYE','NSSF','SHIF','HOUSING_LEVY')),
          amount_minor bigint NOT NULL CHECK (amount_minor > 0),
          paid_date date NOT NULL,
          reference varchar(60),
          entry_id bigint NOT NULL,
          created_by integer,
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (church_id, run_id, kind),
          FOREIGN KEY (church_id, run_id) REFERENCES payroll_runs (church_id, id),
          FOREIGN KEY (church_id, entry_id) REFERENCES journal_entries (church_id, id)
        )`);

      for (const table of TABLES) {
        await enableTenantRls(qi, table, { transaction });
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const table of [...TABLES].reverse()) {
        await queryInterface.sequelize.query(`DROP TABLE IF EXISTS ${table} CASCADE`, { transaction });
      }
    });
  }
};
