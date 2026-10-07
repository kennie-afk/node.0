/** Period close, snapshots, loan loss provisioning, savings interest and share dividends: the accountant's month-end and year-end. */
import { Router } from 'express';
import { authenticate, requirePermission, requireWritable } from './middleware';
import { wrap } from '../common/context';
import { inOrg, parse, queryInt } from './helpers';
import { lockPeriod, lockSchema, periodStatus, unlockPeriod, unlockSchema } from '../ledger/periods';
import { provisionHistory, provisionRequirement, runProvisioning } from '../loans/provisioning';
import { dividendSchema, listDividendRuns, runDividend } from '../savings/dividends';
import { getSettings } from '../common/context';

const router = Router();

router.get('/periods', authenticate, requirePermission('reports'), wrap(async (req, res) => {
  res.json(await inOrg(req, (client) => periodStatus(client)));
}));
router.post('/periods/close', authenticate, requirePermission('journal_post'), requireWritable, wrap(async (req, res) => {
  const body = parse(lockSchema, req.body);
  res.json(await inOrg(req, (client, ctx) => lockPeriod(client, ctx, body)));
}));
// reopening is an owner's decision (the settings permission) and always needs a reason
router.post('/periods/reopen', authenticate, requirePermission('settings'), requireWritable, wrap(async (req, res) => {
  const body = parse(unlockSchema, req.body);
  res.json(await inOrg(req, (client, ctx) => unlockPeriod(client, ctx, body)));
}));

router.get('/provisioning', authenticate, requirePermission('reports'), wrap(async (req, res) => {
  res.json(await inOrg(req, async (client) => {
    const settings = await getSettings(client);
    return {
      preview: await provisionRequirement(client, settings.provisionRatesBp),
      ratesBp: settings.provisionRatesBp,
      history: await provisionHistory(client, Math.min(50, queryInt(req.query.limit, 12)) || 12),
      notice: 'Illustrative percentages, NOT regulatory guidance. An accountant sets and signs off the provision.'
    };
  }));
}));
router.post('/provisioning/run', authenticate, requirePermission('journal_post'), requireWritable, wrap(async (req, res) => {
  res.json(await inOrg(req, (client, ctx) => runProvisioning(client, ctx)));
}));

router.get('/dividends', authenticate, requirePermission('reports'), wrap(async (req, res) => {
  res.json(await inOrg(req, (client) => listDividendRuns(client)));
}));
router.post('/dividends/run', authenticate, requirePermission('journal_post'), requireWritable, wrap(async (req, res) => {
  const body = parse(dividendSchema, req.body);
  res.status(201).json(await inOrg(req, (client, ctx) => runDividend(client, ctx, body)));
}));

export default router;
