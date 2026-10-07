import { DataTypes, Sequelize } from 'sequelize';
import BaseModel from '../../common/base.model';
import type { ModelFactory } from '../types';

class Vendor extends BaseModel<any> {}
class Bill extends BaseModel<any> {}
class BillLine extends BaseModel<any> {}
class BillApproval extends BaseModel<any> {}
class BillPayment extends BaseModel<any> {}
class BillPaymentAllocation extends BaseModel<any> {}
class BillAttachment extends BaseModel<any> {}
class PettyCashReplenishment extends BaseModel<any> {}
class PettyCashVoucher extends BaseModel<any> {}

const id = { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true };
const churchId = { type: DataTypes.INTEGER, allowNull: false };
const minor = (allowNull = false) => ({ type: DataTypes.BIGINT, allowNull });
const str = (n: number, allowNull = true, defaultValue?: string) => ({ type: DataTypes.STRING(n), allowNull, ...(defaultValue ? { defaultValue } : {}) });
// A fresh object per attribute: Sequelize writes the column name onto the definition it is given.
const ts = () => ({ type: DataTypes.DATE, defaultValue: DataTypes.NOW });

/** Mirrors migration 20260930130000-payables; the migration is authoritative in production. */
const factory: ModelFactory = (sequelize: Sequelize) => {
  const base = { underscored: true, timestamps: false };

  Vendor.initModel(
    {
      id, churchId, kind: str(10, false, 'VENDOR'), name: str(150, false), kraPin: str(20), phone: str(20), email: str(100),
      bankName: str(100), bankAccount: str(40), mpesaNumber: str(20), memberId: { type: DataTypes.INTEGER, allowNull: true },
      notes: str(500), isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, createdAt: ts(), updatedAt: ts()
    },
    { ...base, tableName: 'vendors', modelName: 'Vendor', indexes: [{ unique: true, fields: ['church_id', 'name'] }] },
    sequelize
  );

  Bill.initModel(
    {
      id, churchId, billNo: minor(), kind: str(14, false, 'VENDOR_BILL'), vendorId: { type: DataTypes.INTEGER, allowNull: false },
      reference: str(60), billDate: { type: DataTypes.DATEONLY, allowNull: false }, dueDate: { type: DataTypes.DATEONLY, allowNull: false },
      memo: str(500), status: str(16, false, 'DRAFT'), totalMinor: minor(), paidMinor: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
      createdBy: { type: DataTypes.INTEGER, allowNull: true }, submittedBy: { type: DataTypes.INTEGER, allowNull: true },
      submittedAt: { type: DataTypes.DATE, allowNull: true }, requiredApprovals: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      approvedAt: { type: DataTypes.DATE, allowNull: true }, postingDate: { type: DataTypes.DATEONLY, allowNull: true },
      journalEntryId: { type: DataTypes.INTEGER, allowNull: true }, warnings: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
      rejectedReason: str(300), voidReason: str(300), voidedBy: { type: DataTypes.INTEGER, allowNull: true },
      voidedAt: { type: DataTypes.DATE, allowNull: true }, createdAt: ts(), updatedAt: ts()
    },
    { ...base, tableName: 'bills', modelName: 'Bill', indexes: [{ unique: true, fields: ['church_id', 'bill_no'] }, { fields: ['church_id', 'status', 'due_date'] }] },
    sequelize
  );

  BillLine.initModel(
    {
      id, churchId, billId: { type: DataTypes.INTEGER, allowNull: false }, lineNo: { type: DataTypes.INTEGER, allowNull: false },
      accountId: { type: DataTypes.INTEGER, allowNull: false }, fundId: { type: DataTypes.INTEGER, allowNull: false },
      ministryId: { type: DataTypes.INTEGER, allowNull: true }, description: str(255), amountMinor: minor()
    },
    { ...base, tableName: 'bill_lines', modelName: 'BillLine', indexes: [{ unique: true, fields: ['church_id', 'bill_id', 'line_no'] }] },
    sequelize
  );

  BillApproval.initModel(
    {
      id, churchId, billId: { type: DataTypes.INTEGER, allowNull: false }, approverId: { type: DataTypes.INTEGER, allowNull: false },
      approvedAt: ts(), auto: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
    },
    { ...base, tableName: 'bill_approvals', modelName: 'BillApproval', indexes: [{ unique: true, fields: ['church_id', 'bill_id', 'approver_id'] }] },
    sequelize
  );

  BillPayment.initModel(
    {
      id, churchId, billId: { type: DataTypes.INTEGER, allowNull: false }, paidDate: { type: DataTypes.DATEONLY, allowNull: false },
      amountMinor: minor(), fromAccountId: { type: DataTypes.INTEGER, allowNull: false }, reference: str(80), status: str(8, false, 'POSTED'),
      journalEntryId: { type: DataTypes.INTEGER, allowNull: true }, idempotencyKey: str(80),
      createdBy: { type: DataTypes.INTEGER, allowNull: true }, voidedBy: { type: DataTypes.INTEGER, allowNull: true },
      voidReason: str(300), createdAt: ts()
    },
    { ...base, tableName: 'bill_payments', modelName: 'BillPayment', indexes: [{ unique: true, fields: ['church_id', 'idempotency_key'] }] },
    sequelize
  );

  BillPaymentAllocation.initModel(
    {
      churchId: { ...churchId, primaryKey: true }, paymentId: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
      fundId: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true }, amountMinor: minor()
    },
    { ...base, tableName: 'bill_payment_allocations', modelName: 'BillPaymentAllocation' },
    sequelize
  );

  BillAttachment.initModel(
    {
      id, churchId, billId: { type: DataTypes.INTEGER, allowNull: false }, fileName: str(200, false), contentType: str(100, false),
      sizeBytes: minor(), storageKey: str(300, false), sha256: str(64, true), uploadedBy: { type: DataTypes.INTEGER, allowNull: true }, createdAt: ts()
    },
    { ...base, tableName: 'bill_attachments', modelName: 'BillAttachment' },
    sequelize
  );

  PettyCashReplenishment.initModel(
    {
      id, churchId, pettyAccountId: { type: DataTypes.INTEGER, allowNull: false }, sourceAccountId: { type: DataTypes.INTEGER, allowNull: false },
      replenishedOn: { type: DataTypes.DATEONLY, allowNull: false }, amountMinor: minor(),
      journalEntryId: { type: DataTypes.INTEGER, allowNull: true }, createdBy: { type: DataTypes.INTEGER, allowNull: true }, createdAt: ts()
    },
    { ...base, tableName: 'petty_cash_replenishments', modelName: 'PettyCashReplenishment' },
    sequelize
  );

  PettyCashVoucher.initModel(
    {
      id, churchId, voucherNo: minor(), pettyAccountId: { type: DataTypes.INTEGER, allowNull: false },
      voucherDate: { type: DataTypes.DATEONLY, allowNull: false }, payee: str(150, false), memo: str(300),
      accountId: { type: DataTypes.INTEGER, allowNull: false }, fundId: { type: DataTypes.INTEGER, allowNull: false },
      ministryId: { type: DataTypes.INTEGER, allowNull: true }, amountMinor: minor(), status: str(8, false, 'POSTED'),
      journalEntryId: { type: DataTypes.INTEGER, allowNull: true }, replenishmentId: { type: DataTypes.INTEGER, allowNull: true },
      createdBy: { type: DataTypes.INTEGER, allowNull: true }, voidReason: str(300), createdAt: ts()
    },
    { ...base, tableName: 'petty_cash_vouchers', modelName: 'PettyCashVoucher', indexes: [{ unique: true, fields: ['church_id', 'voucher_no'] }] },
    sequelize
  );

  return { Vendor, Bill, BillLine, BillApproval, BillPayment, BillPaymentAllocation, BillAttachment, PettyCashReplenishment, PettyCashVoucher };
};

export default factory;
