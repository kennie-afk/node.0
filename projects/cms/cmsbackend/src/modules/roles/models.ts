import type { ModelFactory } from '../types';
import { T, tableModel } from '../ops-kit';

const factory: ModelFactory = (s) => ({
  ChurchRole: tableModel(s, 'ChurchRole', 'church_roles', { roleKey: T.str(20, true), label: T.str(60, true), description: T.str(200), isSystem: T.bool(false), permissions: T.textReq })
});
export default factory;
