/**
 * Feature-module model registry. A module is a folder under src/modules with `models.ts`
 * (default-exports a ModelFactory) and `routes.ts` (default-exports RouteMount[]). Models load
 * before the database object exists, routes after (see route-registry.ts), so the two halves
 * never import each other. Add one import and one list entry to register a module.
 */
import type { ModelFactory } from './types';

import financeModels from './finance/models';
import givingModels from './giving/models';
import payablesModels from './payables/models';
import bankingModels from './banking/models';
import budgetsModels from './budgets/models';
import payrollModels from './payroll/models';
import mpesaModels from './mpesa/models';
import jobsModels from './jobs/models';
import commsModels from './comms/models';
import volunteersModels from './volunteers/models';
import checkinModels from './checkin/models';
import facilitiesModels from './facilities/models';
import visitorsModels from './visitors/models';
import careModels from './care/models';
import rolesModels from './roles/models';
import dataopsModels from './dataops/models';

export const modelFactories: ModelFactory[] = [
  financeModels,
  givingModels,
  payablesModels,
  bankingModels,
  budgetsModels,
  payrollModels,
  mpesaModels,
  jobsModels,
  commsModels,
  volunteersModels,
  checkinModels,
  facilitiesModels,
  visitorsModels,
  careModels,
  rolesModels,
  dataopsModels
];

