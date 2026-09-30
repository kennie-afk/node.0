import { DataTypes, Sequelize } from 'sequelize';
import BaseModel from '../../common/base.model';
import type { ModelFactory } from '../types';

class Employee extends BaseModel<any> {}
class StaffAdvance extends BaseModel<any> {}
class PayrollRun extends BaseModel<any> {}
class Payslip extends BaseModel<any> {}
class StatutoryRemittance extends BaseModel<any> {}

const id = { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true };
const churchId = { type: DataTypes.INTEGER, allowNull: false };
const minor = (defaultValue?: number) => ({ type: DataTypes.BIGINT, allowNull: false, defaultValue });

/** Mirrors migration 20260930160000-payroll; the migration is the source of truth in production. */
const factory: ModelFactory = (sequelize: Sequelize) => {
  const common = { underscored: true, timestamps: false };
  const stamps = { createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }, updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW } };

  Employee.initModel(
    {
      id, churchId,
      memberId: { type: DataTypes.INTEGER, allowNull: true },
      fullName: { type: DataTypes.STRING(150), allowNull: false },
      nationalId: { type: DataTypes.STRING(20), allowNull: true },
      kraPin: { type: DataTypes.STRING(15), allowNull: true },
      nssfNo: { type: DataTypes.STRING(20), allowNull: true },
      shifNo: { type: DataTypes.STRING(20), allowNull: true },
      email: { type: DataTypes.STRING(120), allowNull: true },
      phone: { type: DataTypes.STRING(20), allowNull: true },
      bankName: { type: DataTypes.STRING(80), allowNull: true },
      bankAccount: { type: DataTypes.STRING(40), allowNull: true },
      mpesaPhone: { type: DataTypes.STRING(20), allowNull: true },
      jobTitle: { type: DataTypes.STRING(100), allowNull: true },
      basicSalaryMinor: minor(0),
      allowances: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
      deductions: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
      insurancePremiumMinor: minor(0),
      fundId: { type: DataTypes.INTEGER, allowNull: true },
      ministryId: { type: DataTypes.INTEGER, allowNull: true },
      status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'ACTIVE' },
      startDate: { type: DataTypes.DATEONLY, allowNull: false },
      endDate: { type: DataTypes.DATEONLY, allowNull: true },
      ...stamps
    },
    { ...common, tableName: 'employees', modelName: 'Employee', timestamps: true, indexes: [{ unique: true, fields: ['church_id', 'kra_pin'] }] },
    sequelize
  );

  StaffAdvance.initModel(
    {
      id, churchId,
      employeeId: { type: DataTypes.INTEGER, allowNull: false },
      amountMinor: minor(),
      monthlyRecoveryMinor: minor(),
      recoveredMinor: minor(0),
      status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'OPEN' },
      issuedDate: { type: DataTypes.DATEONLY, allowNull: false },
      entryId: { type: DataTypes.INTEGER, allowNull: true },
      note: { type: DataTypes.STRING(255), allowNull: true },
      ...stamps
    },
    { ...common, tableName: 'staff_advances', modelName: 'StaffAdvance', timestamps: true },
    sequelize
  );

  PayrollRun.initModel(
    {
      id, churchId,
      year: { type: DataTypes.INTEGER, allowNull: false },
      month: { type: DataTypes.INTEGER, allowNull: false },
      status: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'DRAFT' },
      rateVersion: { type: DataTypes.STRING(20), allowNull: true },
      createdBy: { type: DataTypes.INTEGER, allowNull: true },
      calculatedBy: { type: DataTypes.INTEGER, allowNull: true },
      approvedBy: { type: DataTypes.INTEGER, allowNull: true },
      approvedAt: { type: DataTypes.DATE, allowNull: true },
      postedEntryId: { type: DataTypes.INTEGER, allowNull: true },
      paidEntryId: { type: DataTypes.INTEGER, allowNull: true },
      paidDate: { type: DataTypes.DATEONLY, allowNull: true },
      voidReason: { type: DataTypes.STRING(300), allowNull: true },
      employeeCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      grossMinor: minor(0),
      payeMinor: minor(0),
      nssfEmployeeMinor: minor(0),
      nssfEmployerMinor: minor(0),
      shifMinor: minor(0),
      housingEmployeeMinor: minor(0),
      housingEmployerMinor: minor(0),
      otherDeductionsMinor: minor(0),
      advanceRecoveryMinor: minor(0),
      netMinor: minor(0),
      ...stamps
    },
    { ...common, tableName: 'payroll_runs', modelName: 'PayrollRun', timestamps: true },
    sequelize
  );

  Payslip.initModel(
    {
      id, churchId,
      runId: { type: DataTypes.INTEGER, allowNull: false },
      employeeId: { type: DataTypes.INTEGER, allowNull: false },
      fundId: { type: DataTypes.INTEGER, allowNull: false },
      ministryId: { type: DataTypes.INTEGER, allowNull: true },
      employeeName: { type: DataTypes.STRING(150), allowNull: false },
      kraPin: { type: DataTypes.STRING(15), allowNull: true },
      nssfNo: { type: DataTypes.STRING(20), allowNull: true },
      shifNo: { type: DataTypes.STRING(20), allowNull: true },
      payMethod: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'BANK' },
      payTo: { type: DataTypes.STRING(60), allowNull: true },
      basicMinor: minor(0),
      taxableAllowancesMinor: minor(0),
      nonTaxableAllowancesMinor: minor(0),
      grossMinor: minor(0),
      nssfEmployeeMinor: minor(0),
      nssfEmployerMinor: minor(0),
      shifMinor: minor(0),
      housingEmployeeMinor: minor(0),
      housingEmployerMinor: minor(0),
      taxablePayMinor: minor(0),
      payeBeforeReliefMinor: minor(0),
      personalReliefMinor: minor(0),
      insuranceReliefMinor: minor(0),
      payeMinor: minor(0),
      otherDeductionsMinor: minor(0),
      advanceRecoveryMinor: minor(0),
      netMinor: minor(0),
      detail: { type: DataTypes.JSON, allowNull: false, defaultValue: {} }
    },
    { ...common, tableName: 'payslips', modelName: 'Payslip', indexes: [{ unique: true, fields: ['church_id', 'run_id', 'employee_id'] }] },
    sequelize
  );

  StatutoryRemittance.initModel(
    {
      id, churchId,
      runId: { type: DataTypes.INTEGER, allowNull: false },
      kind: { type: DataTypes.STRING(20), allowNull: false },
      amountMinor: minor(),
      paidDate: { type: DataTypes.DATEONLY, allowNull: false },
      reference: { type: DataTypes.STRING(60), allowNull: true },
      entryId: { type: DataTypes.INTEGER, allowNull: false },
      createdBy: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    { ...common, tableName: 'statutory_remittances', modelName: 'StatutoryRemittance', indexes: [{ unique: true, fields: ['church_id', 'run_id', 'kind'] }] },
    sequelize
  );

  return { Employee, StaffAdvance, PayrollRun, Payslip, StatutoryRemittance };
};

export default factory;
