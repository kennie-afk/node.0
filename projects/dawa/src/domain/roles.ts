/**
 * Who may do what. One table, so the API, the console and the tests cannot disagree.
 *
 *  owner       everything, across every branch, including billing
 *  manager     runs a branch: stock, adjustments, voids, discounts, closing the day, reports, staff below them
 *  pharmacist  receives stock, dispenses prescription and controlled items, counts stock
 *  cashier     rings up over-the-counter sales and takes payments; cannot dispense, void, discount or adjust
 */
export const ROLES = ['owner', 'manager', 'pharmacist', 'cashier'] as const;
export type Role = (typeof ROLES)[number];

export type Permission =
  | 'sell'
  | 'dispense'
  | 'controlled'
  | 'receive_stock'
  | 'adjust_stock'
  | 'stocktake_count'
  | 'stocktake_approve'
  | 'catalogue_write'
  | 'suppliers'
  | 'customers_write'
  | 'void_sale'
  | 'discount'
  | 'return_sale'
  | 'day_close'
  | 'reports'
  | 'team_write'
  | 'branches_write'
  | 'billing';

const MATRIX: Record<Permission, readonly Role[]> = {
  sell: ['owner', 'manager', 'pharmacist', 'cashier'],
  dispense: ['owner', 'manager', 'pharmacist'],
  controlled: ['owner', 'manager', 'pharmacist'],
  receive_stock: ['owner', 'manager', 'pharmacist'],
  adjust_stock: ['owner', 'manager'],
  stocktake_count: ['owner', 'manager', 'pharmacist'],
  stocktake_approve: ['owner', 'manager'],
  catalogue_write: ['owner', 'manager', 'pharmacist'],
  suppliers: ['owner', 'manager'],
  customers_write: ['owner', 'manager', 'pharmacist', 'cashier'],
  void_sale: ['owner', 'manager'],
  discount: ['owner', 'manager'],
  return_sale: ['owner', 'manager', 'pharmacist'],
  day_close: ['owner', 'manager'],
  reports: ['owner', 'manager'],
  team_write: ['owner', 'manager'],
  branches_write: ['owner'],
  billing: ['owner']
};

export function can(role: string, permission: Permission): boolean {
  return (MATRIX[permission] as readonly string[]).includes(role);
}

/** A manager may create staff below them, never another manager or an owner. */
export function canGrantRole(actor: string, target: string): boolean {
  if (actor === 'owner') return target !== 'owner';
  if (actor === 'manager') return target === 'pharmacist' || target === 'cashier';
  return false;
}
