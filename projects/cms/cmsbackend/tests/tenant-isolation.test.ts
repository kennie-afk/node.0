import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import db from '@models';
import { runWithTenant } from '../src/common/tenant-context';
import * as memberService from '../src/members/member.service';
import * as familyService from '../src/families/family.service';
import { paginationSchema } from '../src/common/pagination';


const PAGE = paginationSchema.parse({});

let alpha: number;
let beta: number;

function asChurch<T>(churchId: number, run: () => Promise<T>): Promise<T> {
  return runWithTenant({ churchId, userId: 1, isAdmin: true, requestId: 'test' }, run);
}

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
});

afterAll(async () => {
  await db.sequelize.close();
});

beforeEach(async () => {
  for (const model of [db.Member, db.Family, db.Church]) {
    await model.destroy({ where: {}, truncate: true, cascade: true });
  }
  alpha = (await db.Church.create({ name: 'Alpha Chapel', slug: 'alpha' })).id;
  beta = (await db.Church.create({ name: 'Beta Fellowship', slug: 'beta' })).id;
});

describe('a church only ever sees its own records', () => {
  it('lists only the members belonging to the caller church', async () => {
    await asChurch(alpha, () =>
      memberService.createMember({ firstName: 'Amina', lastName: 'Wanjiru' } as any)
    );
    await asChurch(beta, () =>
      memberService.createMember({ firstName: 'Brian', lastName: 'Otieno' } as any)
    );

    const forAlpha = await asChurch(alpha, () => memberService.getAllMembers(PAGE));
    const forBeta = await asChurch(beta, () => memberService.getAllMembers(PAGE));

    expect(forAlpha.total).toBe(1);
    expect(forBeta.total).toBe(1);
    expect((forAlpha.data[0] as any).firstName).toBe('Amina');
    expect((forBeta.data[0] as any).firstName).toBe('Brian');
  });

  it('refuses to read another church record by its id', async () => {
    const mine = await asChurch(alpha, () =>
      memberService.createMember({ firstName: 'Amina', lastName: 'Wanjiru' } as any)
    );

    const stolen = await asChurch(beta, () => memberService.getMemberById((mine as any).id));

    expect(stolen).toBeNull();
  });

  it('refuses to update another church record', async () => {
    const mine = await asChurch(alpha, () =>
      memberService.createMember({ firstName: 'Amina', lastName: 'Wanjiru' } as any)
    );

    await expect(
      asChurch(beta, () =>
        memberService.updateMember((mine as any).id, { firstName: 'Hijacked' } as any)
      )
    ).rejects.toMatchObject({ statusCode: 404 });

    const untouched = await asChurch(alpha, () => memberService.getMemberById((mine as any).id));
    expect((untouched as any).firstName).toBe('Amina');
  });

  it('refuses to delete another church record', async () => {
    const mine = await asChurch(alpha, () =>
      memberService.createMember({ firstName: 'Amina', lastName: 'Wanjiru' } as any)
    );

    await expect(
      asChurch(beta, () => memberService.deleteMember((mine as any).id))
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(await asChurch(alpha, () => memberService.getMemberById((mine as any).id))).not.toBeNull();
  });

  it('stamps the caller church onto anything created, ignoring a forged churchId', async () => {
    const created = await asChurch(alpha, () =>
      memberService.createMember({ firstName: 'Amina', lastName: 'W', churchId: beta } as any)
    );

    expect((created as any).churchId).toBe(alpha);
  });

  it('will not let an update move a record to another church', async () => {
    const mine = await asChurch(alpha, () =>
      memberService.createMember({ firstName: 'Amina', lastName: 'W' } as any)
    );

    await asChurch(alpha, () =>
      memberService.updateMember((mine as any).id, { churchId: beta } as any)
    );

    const after = await asChurch(alpha, () => memberService.getMemberById((mine as any).id));
    expect((after as any).churchId).toBe(alpha);
  });

  it('will not attach a family belonging to another church', async () => {
    const theirFamily = await asChurch(beta, () =>
      familyService.createFamily({ familyName: 'Otieno' } as any)
    );

    await expect(
      asChurch(alpha, () =>
        memberService.createMember({
          firstName: 'Amina',
          lastName: 'W',
          familyId: (theirFamily as any).id
        } as any)
      )
    ).rejects.toThrow(/does not exist in this church/);
  });
});

describe('queries outside a request are refused rather than run unscoped', () => {
  it('throws instead of returning every church record', async () => {
    await expect(memberService.getAllMembers(PAGE)).rejects.toThrow(
      /no church is in scope/
    );
  });
});
