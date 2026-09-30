import { input, route } from '../common/http';
import * as service from './contribution.service';
import * as schemas from './contribution.schemas';

export const createContribution = route(async (req) => {
  const { body } = input(schemas.createContributionSchema, req);
  return service.createContribution({ ...body, amountMinor: body.amount, typeName: body.contributionType });
}, 201);

export const getAllContributions = route(async (req) => {
  const { query } = input(schemas.listContributionsSchema, req);
  const { page, pageSize, limit: _l, cursor: _c, ...filter } = query;
  return service.getAllContributions(filter, page, pageSize);
});

export const getContributionById = route(async (req) => service.getContributionById(input(schemas.contributionIdSchema, req).params.id));

export const updateContribution = route(async (req) => {
  const { params, body } = input(schemas.updateContributionSchema, req);
  const { amount, ...rest } = body;
  return service.updateContribution(params.id, { ...rest, amountMinor: amount, contributionType: body.contributionType });
});

export const deleteContribution = route(async (req) => {
  await service.deleteContribution(input(schemas.contributionIdSchema, req).params.id);
  return undefined;
}, 204);
