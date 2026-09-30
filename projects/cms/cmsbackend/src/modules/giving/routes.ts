import { Router } from 'express';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';
import { currentTenant } from '../../common/tenant-context';
import { idempotent } from '../../common/idempotency';
import { input, requestTx, route } from '../../common/http';
import { fromMinor } from '../../common/money';
import type { RouteMount } from '../types';
import * as s from './schemas';
import { createType, ensureGivingSetup, listTypes, updateType } from './types.service';
import { findByReceipt, getContribution, listContributionsKeyset, recordContribution, voidContribution } from './contributions.service';
import { addItem, batchItems, countBatch, createBatch, getBatch, listBatches, removeItem, reopenBatch, verifyBatch } from './batches.service';
import { cancelPledge, createCampaign, createPledge, getCampaign, getPledge, listCampaigns, listPledges, updateCampaign, updatePledge } from './pledges.service';
import { createRecurring, generateDueRecurringGifts, getRecurring, listRecurring, updateRecurring } from './recurring.service';
import { memberStatement } from './statements.service';
import { today } from './shared';

const router = Router();
const me = () => {
  const tenant = currentTenant();
  return { churchId: tenant.churchId, userId: tenant.userId };
};

/** Gives a church that predates giving its starting types before any giving route runs. */
export const givingSetup = async (_req: unknown, _res: unknown, next: (error?: unknown) => void) => {
  try {
    await ensureGivingSetup(await requestTx(), currentTenant().churchId);
    next();
  } catch (error) {
    next(error);
  }
};

router.use(authenticateToken, givingSetup);

const read = requirePermission('giving:read');
const write = requirePermission('giving:write');
const key = (req: { header: (name: string) => string | undefined }) => req.header('idempotency-key') ?? null;

// ---- giving types -------------------------------------------------------------------------
router.get('/types', read, route(async (req) => listTypes(await requestTx(), me().churchId, req.query.includeInactive === 'true')));
router.post('/types', write, route(async (req) => createType(await requestTx(), me().churchId, me().userId, input(s.typeCreate, req).body), 201));
router.put('/types/:id', write, route(async (req) => {
  const { params, body } = input(s.typeUpdate, req);
  return updateType(await requestTx(), me().churchId, me().userId, params.id, body);
}));

// ---- contributions (keyset view; the legacy /contributions route keeps offset paging) -----
router.get('/contributions', read, route(async (req) => {
  const { query } = input(s.listContributions, req);
  const { limit, cursor, page: _p, pageSize: _s, ...filter } = query;
  return listContributionsKeyset(await requestTx(), me().churchId, filter, limit, cursor);
}));
router.get('/contributions/:id', read, route(async (req) => getContribution(await requestTx(), me().churchId, input(s.idOnly, req).params.id)));
router.post('/contributions', write, idempotent(), route(async (req) => {
  const { body } = input(s.createContribution, req);
  return recordContribution(await requestTx(), me().churchId, me().userId, {
    ...body,
    amountMinor: body.amount,
    date: body.date,
    typeName: body.contributionType,
    transactionId: body.transactionId ?? key(req)
  });
}, 201));
router.post('/contributions/:id/void', write, route(async (req) => {
  const { params, body } = input(s.voidContribution, req);
  return voidContribution(await requestTx(), me().churchId, me().userId, params.id, body.reason);
}));
router.get('/receipts/:receiptNo', read, route(async (req) => findByReceipt(await requestTx(), me().churchId, input(s.receiptParam, req).params.receiptNo)));

// ---- counting batches ---------------------------------------------------------------------
router.get('/batches', read, route(async (req) => {
  const { query } = input(s.batchList, req);
  return listBatches(await requestTx(), me().churchId, { status: query.status }, query.limit, query.cursor);
}));
router.post('/batches', write, route(async (req) => createBatch(await requestTx(), me().churchId, me().userId, input(s.batchCreate, req).body), 201));
router.get('/batches/:id', read, route(async (req) => {
  const t = await requestTx();
  const id = input(s.idOnly, req).params.id;
  return { ...(await getBatch(t, me().churchId, id)), items: await batchItems(t, me().churchId, id) };
}));
router.post('/batches/:id/items', write, route(async (req) => {
  const { params, body } = input(s.batchItem, req);
  return addItem(await requestTx(), me().churchId, me().userId, params.id, { ...body, amountMinor: body.amount, typeName: body.contributionType });
}, 201));
router.delete('/batches/:id/items/:contributionId', write, route(async (req) => {
  const { params } = input(s.batchItemRemove, req);
  await removeItem(await requestTx(), me().churchId, params.id, params.contributionId);
  return undefined;
}, 204));
router.post('/batches/:id/count', write, route(async (req) => {
  const { params, body } = input(s.batchCount, req);
  return countBatch(await requestTx(), me().churchId, me().userId, params.id, body.countedTotal);
}));
router.post('/batches/:id/reopen', write, route(async (req) => reopenBatch(await requestTx(), me().churchId, me().userId, input(s.idOnly, req).params.id)));
router.post('/batches/:id/verify', write, route(async (req) => verifyBatch(await requestTx(), me().churchId, me().userId, input(s.idOnly, req).params.id)));

// ---- campaigns & pledges ------------------------------------------------------------------
router.get('/campaigns', read, route(async (req) => listCampaigns(await requestTx(), me().churchId, input(s.campaignList, req).query.status)));
router.post('/campaigns', write, route(async (req) => {
  const { body } = input(s.campaignCreate, req);
  return createCampaign(await requestTx(), me().churchId, me().userId, { ...body, goalMinor: body.goal });
}, 201));
router.get('/campaigns/:id', read, route(async (req) => getCampaign(await requestTx(), me().churchId, input(s.idOnly, req).params.id)));
router.put('/campaigns/:id', write, route(async (req) => {
  const { params, body } = input(s.campaignUpdate, req);
  return updateCampaign(await requestTx(), me().churchId, me().userId, params.id, { ...body, goalMinor: body.goal });
}));

router.get('/pledges', read, route(async (req) => {
  const { query } = input(s.pledgeList, req);
  return listPledges(await requestTx(), me().churchId, { ...query, behindOnly: query.behindOnly === 'true' }, query.limit, query.cursor);
}));
router.post('/pledges', write, route(async (req) => {
  const { body } = input(s.pledgeCreate, req);
  return createPledge(await requestTx(), me().churchId, me().userId, { ...body, amountMinor: body.amount, installmentMinor: body.installment });
}, 201));
router.get('/pledges/:id', read, route(async (req) => getPledge(await requestTx(), me().churchId, input(s.idOnly, req).params.id)));
router.put('/pledges/:id', write, route(async (req) => {
  const { params, body } = input(s.pledgeUpdate, req);
  return updatePledge(await requestTx(), me().churchId, me().userId, params.id, { ...body, amountMinor: body.amount, installmentMinor: body.installment });
}));
router.post('/pledges/:id/cancel', write, route(async (req) => {
  const { params, body } = input(s.pledgeCancel, req);
  return cancelPledge(await requestTx(), me().churchId, me().userId, params.id, body.reason);
}));

// ---- recurring gifts ----------------------------------------------------------------------
router.get('/recurring', read, route(async (req) => listRecurring(await requestTx(), me().churchId, input(s.recurringList, req).query)));
router.post('/recurring', write, route(async (req) => {
  const { body } = input(s.recurringCreate, req);
  return createRecurring(await requestTx(), me().churchId, me().userId, { ...body, amountMinor: body.amount });
}, 201));
router.get('/recurring/:id', read, route(async (req) => getRecurring(await requestTx(), me().churchId, input(s.idOnly, req).params.id)));
router.put('/recurring/:id', write, route(async (req) => {
  const { params, body } = input(s.recurringUpdate, req);
  return updateRecurring(await requestTx(), me().churchId, me().userId, params.id, { ...body, amountMinor: body.amount });
}));
router.post('/recurring/run', write, route(async (req) => {
  const { body } = input(s.recurringRun, req);
  return generateDueRecurringGifts(await requestTx(), me().churchId, body.asOf ?? today(), me().userId);
}));

// ---- statements ---------------------------------------------------------------------------
router.get('/statements/members/:memberId', read, route(async (req) => {
  const { params, query } = input(s.statementQuery, req);
  return memberStatement(await requestTx(), me().churchId, params.memberId, query.year);
}));

void fromMinor;
const mounts: RouteMount[] = [{ path: '/giving', router }];
export default mounts;
