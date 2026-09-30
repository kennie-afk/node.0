import { z } from 'zod';
import { createContribution, updateContribution, listContributions, idOnly } from '../modules/giving/schemas';

// The console's /contributions contract, now validated by the giving module's schemas: amounts
// may be numbers or decimal strings, the date a plain date or an ISO timestamp, the member optional.
export const createContributionSchema = createContribution;
export const updateContributionSchema = updateContribution;
export const listContributionsSchema = listContributions;
export const contributionIdSchema = idOnly;
export { z };
