'use strict';

const { enableTenantRls } = require('../migrations-lib/tenant');

const TABLES = [
  'vendors', 'bills', 'bill_lines', 'bill_approvals', 'bill_payments', 'bill_payment_allocations',
  'bill_attachments', 'petty_cash_replenishments', 'petty_cash_vouchers'
];

/**
 * Accounts payable: vendors, bills with lines, the approval trail, payments and their per-fund
 * allocations, attachment metadata, and petty cash vouchers. Composite foreign keys keep every
 * reference inside one church; row-level security stamps each table with the tenant.
 */
module.exports = {
  async up(queryInterface) {
    const qi = queryInterface;
    await qi.sequelize.transaction(async (transaction) => {
      const q = (sql) => qi.sequelize.query(sql, { transaction });

      await q(`
        CREATE TABLE vendors (
          id bigserial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          kind varchar(10) NOT NULL DEFAULT 'VENDOR' CHECK (kind IN ('VENDOR','STAFF','MEMBER')),
          name varchar(150) NOT NULL,
          kra_pin varchar(20),
          phone varchar(20),
          email varchar(100),
          bank_name varchar(100),
          bank_account varchar(40),
          mpesa_number varchar(20),
          member_id integer,
          notes varchar(500),
          is_active boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (church_id, id),
          UNIQUE (church_id, name),
          FOREIGN KEY (church_id, member_id) REFERENCES members (church_id, id)
        )`);

      await q(`
        CREATE TABLE bills (
          id bigserial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          bill_no bigint NOT NULL,
          kind varchar(14) NOT NULL DEFAULT 'VENDOR_BILL' CHECK (kind IN ('VENDOR_BILL','EXPENSE_CLAIM')),
          vendor_id bigint NOT NULL,
          reference varchar(60),
          bill_date date NOT NULL,
          due_date date NOT NULL,
          memo varchar(500),
          status varchar(16) NOT NULL DEFAULT 'DRAFT'
            CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','PARTIALLY_PAID','PAID','VOID')),
          total_minor bigint NOT NULL CHECK (total_minor > 0),
          paid_minor bigint NOT NULL DEFAULT 0 CHECK (paid_minor >= 0 AND paid_minor <= total_minor),
          created_by integer,
          submitted_by integer,
          submitted_at timestamptz,
          required_approvals smallint NOT NULL DEFAULT 1,
          approved_at timestamptz,
          posting_date date,
          journal_entry_id bigint,
          warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
          rejected_reason varchar(300),
          void_reason varchar(300),
          voided_by integer,
          voided_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (church_id, bill_no),
          UNIQUE (church_id, id),
          FOREIGN KEY (church_id, vendor_id) REFERENCES vendors (church_id, id),
          FOREIGN KEY (church_id, journal_entry_id) REFERENCES journal_entries (church_id, id)
        )`);
      await q(`CREATE INDEX bills_status ON bills (church_id, status, due_date)`);
      await q(`CREATE INDEX bills_date ON bills (church_id, bill_date DESC, id DESC)`);
      await q(`CREATE INDEX bills_vendor ON bills (church_id, vendor_id)`);

      await q(`
        CREATE TABLE bill_lines (
          id bigserial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          bill_id bigint NOT NULL,
          line_no smallint NOT NULL,
          account_id bigint NOT NULL,
          fund_id bigint NOT NULL,
          ministry_id integer,
          description varchar(255),
          amount_minor bigint NOT NULL CHECK (amount_minor > 0),
          UNIQUE (church_id, bill_id, line_no),
          FOREIGN KEY (church_id, bill_id) REFERENCES bills (church_id, id) ON DELETE CASCADE,
          FOREIGN KEY (church_id, account_id) REFERENCES accounts (church_id, id),
          FOREIGN KEY (church_id, fund_id) REFERENCES funds (church_id, id),
          FOREIGN KEY (church_id, ministry_id) REFERENCES ministries (church_id, id)
        )`);
      await q(`CREATE INDEX bill_lines_account ON bill_lines (church_id, account_id, fund_id)`);

      await q(`
        CREATE TABLE bill_approvals (
          id bigserial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          bill_id bigint NOT NULL,
          approver_id integer NOT NULL,
          approved_at timestamptz NOT NULL DEFAULT now(),
          auto boolean NOT NULL DEFAULT false,
          UNIQUE (church_id, bill_id, approver_id),
          FOREIGN KEY (church_id, bill_id) REFERENCES bills (church_id, id) ON DELETE CASCADE
        )`);

      await q(`
        CREATE TABLE bill_payments (
          id bigserial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          bill_id bigint NOT NULL,
          paid_date date NOT NULL,
          amount_minor bigint NOT NULL CHECK (amount_minor > 0),
          from_account_id bigint NOT NULL,
          reference varchar(80),
          status varchar(8) NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED','VOID')),
          journal_entry_id bigint,
          idempotency_key varchar(80),
          created_by integer,
          voided_by integer,
          void_reason varchar(300),
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (church_id, id),
          FOREIGN KEY (church_id, bill_id) REFERENCES bills (church_id, id),
          FOREIGN KEY (church_id, from_account_id) REFERENCES accounts (church_id, id),
          FOREIGN KEY (church_id, journal_entry_id) REFERENCES journal_entries (church_id, id)
        )`);
      await q(`CREATE UNIQUE INDEX bill_payments_idempotency ON bill_payments (church_id, idempotency_key) WHERE idempotency_key IS NOT NULL`);
      await q(`CREATE INDEX bill_payments_bill ON bill_payments (church_id, bill_id)`);

      await q(`
        CREATE TABLE bill_payment_allocations (
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          payment_id bigint NOT NULL,
          fund_id bigint NOT NULL,
          amount_minor bigint NOT NULL CHECK (amount_minor > 0),
          PRIMARY KEY (church_id, payment_id, fund_id),
          FOREIGN KEY (church_id, payment_id) REFERENCES bill_payments (church_id, id) ON DELETE CASCADE,
          FOREIGN KEY (church_id, fund_id) REFERENCES funds (church_id, id)
        )`);

      await q(`
        CREATE TABLE bill_attachments (
          id bigserial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          bill_id bigint NOT NULL,
          file_name varchar(200) NOT NULL,
          content_type varchar(100) NOT NULL,
          size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
          storage_key varchar(300) NOT NULL,
          uploaded_by integer,
          created_at timestamptz NOT NULL DEFAULT now(),
          FOREIGN KEY (church_id, bill_id) REFERENCES bills (church_id, id) ON DELETE CASCADE
        )`);

      await q(`
        CREATE TABLE petty_cash_replenishments (
          id bigserial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          petty_account_id bigint NOT NULL,
          source_account_id bigint NOT NULL,
          replenished_on date NOT NULL,
          amount_minor bigint NOT NULL CHECK (amount_minor > 0),
          journal_entry_id bigint,
          created_by integer,
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (church_id, id),
          FOREIGN KEY (church_id, petty_account_id) REFERENCES accounts (church_id, id),
          FOREIGN KEY (church_id, source_account_id) REFERENCES accounts (church_id, id),
          FOREIGN KEY (church_id, journal_entry_id) REFERENCES journal_entries (church_id, id)
        )`);

      await q(`
        CREATE TABLE petty_cash_vouchers (
          id bigserial PRIMARY KEY,
          church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
          voucher_no bigint NOT NULL,
          petty_account_id bigint NOT NULL,
          voucher_date date NOT NULL,
          payee varchar(150) NOT NULL,
          memo varchar(300),
          account_id bigint NOT NULL,
          fund_id bigint NOT NULL,
          ministry_id integer,
          amount_minor bigint NOT NULL CHECK (amount_minor > 0),
          status varchar(8) NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED','VOID')),
          journal_entry_id bigint,
          replenishment_id bigint,
          created_by integer,
          void_reason varchar(300),
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (church_id, voucher_no),
          UNIQUE (church_id, id),
          FOREIGN KEY (church_id, petty_account_id) REFERENCES accounts (church_id, id),
          FOREIGN KEY (church_id, account_id) REFERENCES accounts (church_id, id),
          FOREIGN KEY (church_id, fund_id) REFERENCES funds (church_id, id),
          FOREIGN KEY (church_id, ministry_id) REFERENCES ministries (church_id, id),
          FOREIGN KEY (church_id, journal_entry_id) REFERENCES journal_entries (church_id, id),
          FOREIGN KEY (church_id, replenishment_id) REFERENCES petty_cash_replenishments (church_id, id)
        )`);
      await q(`CREATE INDEX petty_cash_vouchers_open ON petty_cash_vouchers (church_id, petty_account_id) WHERE replenishment_id IS NULL AND status = 'POSTED'`);

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
