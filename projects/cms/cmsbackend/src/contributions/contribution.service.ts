import { currentTenant } from '../common/tenant-context';
import { requestTx } from '../common/http';
import { ensureGivingSetup } from '../modules/giving/types.service';
import {
  ContributionChanges,
  ContributionFilter,
  deleteContribution as removeContribution,
  getContribution as loadContribution,
  listContributionsKeyset,
  listContributionsPaged,
  recordContribution,
  RecordInput,
  updateContribution as changeContribution
} from '../modules/giving/contributions.service';

/** Tenant-scoped entry points for the /contributions routes; all the work lives in the giving module. */
async function scope() {
  const t = await requestTx();
  const { churchId, userId } = currentTenant();
  await ensureGivingSetup(t, churchId);
  return { t, churchId, userId };
}

export const createContribution = async (input: RecordInput) => {
  const { t, churchId, userId } = await scope();
  return recordContribution(t, churchId, userId, input);
};

export const getAllContributions = async (filter: ContributionFilter, page: number, pageSize: number) => {
  const { t, churchId } = await scope();
  return listContributionsPaged(t, churchId, filter, page, pageSize);
};

export const getAllContributionsKeyset = async (filter: ContributionFilter, limit: number, cursor?: string) => {
  const { t, churchId } = await scope();
  return listContributionsKeyset(t, churchId, filter, limit, cursor);
};

export const getContributionById = async (id: number) => {
  const { t, churchId } = await scope();
  return loadContribution(t, churchId, id);
};

export const updateContribution = async (id: number, changes: ContributionChanges) => {
  const { t, churchId, userId } = await scope();
  return changeContribution(t, churchId, userId, id, changes);
};

export const deleteContribution = async (id: number) => {
  const { t, churchId } = await scope();
  return removeContribution(t, churchId, id);
};
