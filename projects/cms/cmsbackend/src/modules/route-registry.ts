/**
 * Feature-module route registry; see model-registry.ts. Each module default-exports RouteMount[].
 */
import type { RouteMount } from './types';

import financeRoutes from './finance/routes';
import givingRoutes from './giving/routes';
import payablesRoutes from './payables/routes';
import bankingRoutes from './banking/routes';
import budgetsRoutes from './budgets/routes';
import payrollRoutes from './payroll/routes';
import mpesaRoutes from './mpesa/routes';
import reportsRoutes from './reports/routes';
import commsRoutes from './comms/routes';
import volunteersRoutes from './volunteers/routes';
import checkinRoutes from './checkin/routes';
import facilitiesRoutes from './facilities/routes';
import visitorsRoutes from './visitors/routes';
import careRoutes from './care/routes';
import rolesRoutes from './roles/routes';
import selfserviceRoutes from './selfservice/routes';
import dataopsRoutes from './dataops/routes';

export const routeMounts: RouteMount[] = [
  ...financeRoutes,
  ...givingRoutes,
  ...payablesRoutes,
  ...bankingRoutes,
  ...budgetsRoutes,
  ...payrollRoutes,
  ...mpesaRoutes,
  ...reportsRoutes,
  ...commsRoutes,
  ...volunteersRoutes,
  ...checkinRoutes,
  ...facilitiesRoutes,
  ...visitorsRoutes,
  ...careRoutes,
  ...rolesRoutes,
  ...selfserviceRoutes,
  ...dataopsRoutes
];
