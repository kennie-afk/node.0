import bcrypt from 'bcrypt';
import db from '@models';
import { ConflictError } from '../utils/errors';
import { OnboardChurchInput } from './church.schemas';
import { setTenantLocal } from '../common/tenant-db';
import { emailExists } from '../auth/auth.service';
import { ensureFinanceSetup } from '../modules/finance/setup.service';

const PASSWORD_ROUNDS = 12;

export interface OnboardResult {
  church: { id: number; name: string; slug: string };
  owner: { id: number; username: string; email: string };
}

export const onboardChurch = async (input: OnboardChurchInput): Promise<OnboardResult> => {
  const existing = await db.Church.findOne({ where: { slug: input.church.slug } });
  if (existing) {
    throw new ConflictError(`The slug ${input.church.slug} is already taken.`);
  }

  if (await emailExists(input.owner.email)) {
    throw new ConflictError('That email address is already registered.');
  }

  return db.sequelize.transaction(async (transaction: any) => {
    const church = await db.Church.create(
      {
        name: input.church.name,
        slug: input.church.slug,
        timezone: input.church.timezone ?? 'Africa/Nairobi'
      },
      { transaction }
    );

    // From here on the transaction acts for the new church, which row-level security requires.
    await setTenantLocal(db.sequelize, transaction, church.id);

    const owner = await db.User.create(
      {
        churchId: church.id,
        username: input.owner.username,
        email: input.owner.email,
        password_hash: await bcrypt.hash(input.owner.password, PASSWORD_ROUNDS),
        isAdmin: true,
        role: 'ADMIN'
      },
      { transaction }
    );

    await ensureFinanceSetup(transaction, church.id);

    return {
      church: { id: church.id, name: church.name, slug: church.slug },
      owner: { id: owner.id, username: owner.username, email: owner.email }
    };
  });
};
