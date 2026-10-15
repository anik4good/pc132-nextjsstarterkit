/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require('@prisma/client');
const { faker } = require('@faker-js/faker');
const bcrypt = require('bcrypt');
const rolesData = require('./data/roles');
const usersData = require('./data/users');
const permissionsData = require('./data/permissions');

const prisma = new PrismaClient();

// Deterministic grants per role slug — replaces the old random assignment so
// "superadmin has everything" is actually true in the data.
const SLUGS = (permissionsData || []).map((p) => p.slug);
const all = () => [...SLUGS];
const except = (slugs) => SLUGS.filter((s) => !slugs.includes(s));

const ROLE_PERMISSIONS = {
  superadmin: all(), // platform superadmin — every permission
  admin: except([
    'role.add',
    'role.edit',
    'role.delete',
    'permission.view',
    'permission.edit',
    'company.add',
    'company.delete',
  ]), // company admin — manages own company, not the role catalog
  manager: ['dashboard.view', 'user.view', 'report.view', 'report.export'],
  member: ['dashboard.view'],
  staff: ['dashboard.view'],
  support: ['dashboard.view'],
  vendor: ['dashboard.view'],
  customer: [],
  guest: [],
};

// Demo companies (tenants)
const COMPANIES = [
  {
    slug: 'acme-corp',
    name: 'Acme Corp',
    description: 'Demo tenant used to showcase company scoping.',
    email: 'contact@acme.test',
    website: 'https://acme.test',
  },
  {
    slug: 'globex',
    name: 'Globex',
    description: 'Second demo tenant used to showcase company scoping.',
    email: 'contact@globex.test',
    website: 'https://globex.test',
  },
];

// Passwords satisfy the app's policy (8+ chars, upper, lower, digit, special).
const PASSWORDS = {
  superadmin: 'Owner#12345',
  demo: 'Demo#12345',
  companyAdmin: 'Admin#12345',
  member: 'Member#12345',
};

async function main() {
  console.log('Running database seeding...');

  await prisma.$transaction(
    async (tx) => {
      // ---- Roles ----------------------------------------------------------
      const superAdminRole = await tx.userRole.upsert({
        where: { slug: 'superadmin' },
        update: {
          isSuperAdmin: true,
          isProtected: true,
          isTrashed: false,
        },
        create: {
          slug: 'superadmin',
          name: 'Super Admin',
          description:
            'Platform superadmin: manages all companies, users, roles and permissions.',
          isProtected: true,
          isDefault: false,
          isSuperAdmin: true,
          createdAt: new Date(),
        },
      });

      await tx.userRole.upsert({
        where: { slug: 'member' },
        update: { isDefault: true, isProtected: true },
        create: {
          slug: 'member',
          name: 'Member',
          description: 'Normal user within a company.',
          isDefault: true,
          isProtected: true,
          createdAt: new Date(),
        },
      });

      for (const role of rolesData) {
        await tx.userRole.upsert({
          where: { slug: role.slug },
          update: {
            name: role.name,
            description: role.description,
            isDefault: role.isDefault || false,
            isProtected: role.isProtected || false,
            // The seeded Administrator role is the company-admin tier.
            isCompanyAdmin: role.slug === 'admin' ? true : undefined,
          },
          create: {
            slug: role.slug,
            name: role.name,
            description: role.description,
            isDefault: role.isDefault || false,
            isProtected: role.isProtected || false,
            isCompanyAdmin: role.slug === 'admin',
            createdAt: new Date(),
          },
        });
      }

      // The pre-tenant "owner" role is superseded by "superadmin" — soft-remove it.
      await tx.userRole.updateMany({
        where: { slug: 'owner' },
        data: { isTrashed: true },
      });
      console.log('Roles seeded.');

      // ---- Permissions ----------------------------------------------------
      for (const permission of permissionsData) {
        await tx.userPermission.upsert({
          where: { slug: permission.slug },
          update: {
            name: permission.name,
            description: permission.description,
          },
          create: {
            slug: permission.slug,
            name: permission.name,
            description: permission.description,
            createdAt: new Date(),
          },
        });
      }
      console.log('Permissions seeded.');

      // ---- Role -> permissions (deterministic) -----------------------------
      const seededPermissions = await tx.userPermission.findMany();
      const permissionBySlug = new Map(seededPermissions.map((p) => [p.slug, p]));
      const seededRoles = await tx.userRole.findMany();

      for (const role of seededRoles) {
        const slugs = ROLE_PERMISSIONS[role.slug] ?? [];
        // Superadmin always gets everything, even if new permissions aren't in the map.
        const granted =
          role.isSuperAdmin || role.slug === 'superadmin'
            ? seededPermissions
            : slugs
                .map((slug) => permissionBySlug.get(slug))
                .filter(Boolean);

        for (const permission of granted) {
          await tx.userRolePermission.upsert({
            where: {
              roleId_permissionId: {
                roleId: role.id,
                permissionId: permission.id,
              },
            },
            update: {},
            create: {
              roleId: role.id,
              permissionId: permission.id,
              assignedAt: new Date(),
            },
          });
        }
      }
      console.log('UserRolePermissions seeded.');

      // ---- Platform superadmin users --------------------------------------
      const hashedPassword = await bcrypt.hash(PASSWORDS.superadmin, 10);
      const demoPassword = await bcrypt.hash(PASSWORDS.demo, 10);

      const superAdminUser = await tx.user.upsert({
        where: { email: 'owner@kt.com' },
        update: {
          password: hashedPassword,
          roleId: superAdminRole.id,
          companyId: null,
        },
        create: {
          email: 'owner@kt.com',
          name: 'Super Admin',
          password: hashedPassword,
          roleId: superAdminRole.id,
          avatar: null,
          emailVerifiedAt: new Date(),
          status: 'ACTIVE',
          isProtected: true, // Cannot be modified or deleted from the admin UI
        },
      });

      await tx.user.upsert({
        where: { email: 'demo@kt.com' },
        update: {
          password: demoPassword,
          roleId: superAdminRole.id,
          companyId: null,
        },
        create: {
          email: 'demo@kt.com',
          name: 'Demo',
          password: demoPassword,
          roleId: superAdminRole.id,
          avatar: null,
          emailVerifiedAt: new Date(),
          status: 'ACTIVE',
        },
      });

      // ---- Demo companies (tenants) ----------------------------------------
      const companies = {};
      for (const company of COMPANIES) {
        companies[company.slug] = await tx.company.upsert({
          where: { slug: company.slug },
          update: {
            name: company.name,
            description: company.description,
            email: company.email,
            website: company.website,
            isTrashed: false,
          },
          create: {
            slug: company.slug,
            name: company.name,
            description: company.description,
            email: company.email,
            website: company.website,
            createdByUserId: superAdminUser.id,
          },
        });
      }

      // ---- Company demo users ----------------------------------------------
      const acme = companies['acme-corp'];
      const globex = companies['globex'];
      const adminRole = await tx.userRole.findUnique({ where: { slug: 'admin' } });
      const memberRole = await tx.userRole.findUnique({
        where: { slug: 'member' },
      });
      const companyAdminPassword = await bcrypt.hash(
        PASSWORDS.companyAdmin,
        10,
      );
      const memberPassword = await bcrypt.hash(PASSWORDS.member, 10);

      await tx.user.upsert({
        where: { email: 'admin@acme.com' },
        update: {
          password: companyAdminPassword,
          roleId: adminRole.id,
          companyId: acme.id,
        },
        create: {
          email: 'admin@acme.com',
          name: 'Acme Admin',
          password: companyAdminPassword,
          roleId: adminRole.id,
          companyId: acme.id,
          emailVerifiedAt: new Date(),
          status: 'ACTIVE',
        },
      });

      await tx.user.upsert({
        where: { email: 'admin@globex.com' },
        update: {
          password: companyAdminPassword,
          roleId: adminRole.id,
          companyId: globex.id,
        },
        create: {
          email: 'admin@globex.com',
          name: 'Globex Admin',
          password: companyAdminPassword,
          roleId: adminRole.id,
          companyId: globex.id,
          emailVerifiedAt: new Date(),
          status: 'ACTIVE',
        },
      });

      await tx.user.upsert({
        where: { email: 'member@acme.com' },
        update: {
          password: memberPassword,
          roleId: memberRole.id,
          companyId: acme.id,
        },
        create: {
          email: 'member@acme.com',
          name: 'Acme Member',
          password: memberPassword,
          roleId: memberRole.id,
          companyId: acme.id,
          emailVerifiedAt: new Date(),
          status: 'ACTIVE',
        },
      });
      console.log('Superadmin, companies and company users seeded.');

      // ---- Plans + company subscriptions -----------------------------------
      const freePlan = await tx.plan.upsert({
        where: { slug: 'free' },
        update: { isActive: true, isDefault: true, maxUsers: 5 },
        create: {
          slug: 'free',
          name: 'Free',
          description: 'For small teams getting started.',
          priceMonthly: 0,
          currency: 'USD',
          maxUsers: 5,
          features: { users: 'Up to 5 users', support: 'Community support' },
          isActive: true,
          isDefault: true,
        },
      });

      await tx.plan.upsert({
        where: { slug: 'pro' },
        update: { isActive: true, isDefault: false },
        create: {
          slug: 'pro',
          name: 'Pro',
          description: 'Unlimited users and priority support.',
          priceMonthly: 4900,
          currency: 'USD',
          maxUsers: null,
          features: {
            users: 'Unlimited users',
            support: 'Priority support',
            billing: 'Monthly billing',
          },
          isActive: true,
          isDefault: false,
        },
      });

      for (const company of Object.values(companies)) {
        const existing = await tx.subscription.findUnique({
          where: { companyId: company.id },
        });
        if (!existing) {
          await tx.subscription.create({
            data: {
              companyId: company.id,
              planId: freePlan.id,
              status: 'active',
            },
          });
        }
      }
      console.log('Plans and subscriptions seeded.');

      // ---- Bulk demo users (split across the two companies) -----------------
      for (const [index, user] of usersData.entries()) {
        const role = await tx.userRole.findFirst({
          where: { slug: user.roleSlug },
        });
        if (!role) continue;
        const company = index % 2 === 0 ? acme : globex;

        await tx.user.upsert({
          where: { email: user.email },
          update: { roleId: role.id, companyId: company.id },
          create: {
            email: user.email,
            name: user.name,
            password: hashedPassword,
            avatar: user.avatar ? '/media/avatars/' + user.avatar : null,
            roleId: role.id,
            companyId: company.id,
            emailVerifiedAt: new Date(),
            status: 'ACTIVE',
            createdAt: new Date(),
          },
        });
      }
      console.log('Users seeded.');

      // ---- Demo audit logs --------------------------------------------------
      const users = await tx.user.findMany({
        where: { isTrashed: false },
        select: { id: true, companyId: true },
      });

      const verbMap = {
        CREATE: ['created', 'added', 'initialized', 'generated'],
        UPDATE: ['updated', 'modified', 'changed', 'edited'],
        DELETE: ['deleted', 'removed', 'cleared', 'erased'],
        FETCH: ['fetched', 'retrieved', 'requested', 'accessed'],
      };

      const systemLogPromises = Array.from({ length: 20 }).map(() => {
        const actor = faker.helpers.arrayElement(users);
        const entity = faker.helpers.arrayElement(users);
        const event = faker.helpers.arrayElement([
          'CREATE',
          'UPDATE',
          'DELETE',
          'FETCH',
        ]);
        const verb = faker.helpers.arrayElement(verbMap[event]);

        return tx.systemLog.create({
          data: {
            event,
            userId: actor.id,
            companyId: actor.companyId,
            entityId: entity.id,
            entityType: 'user',
            description: `user was ${verb}`,
            createdAt: new Date(),
            ipAddress: faker.internet.ipv4(),
          },
        });
      });

      await Promise.all(systemLogPromises);

      // ---- Settings (only if none exist — safe across re-seeds) --------------
      const existingSettings = await tx.systemSetting.findFirst();
      if (!existingSettings) {
        await tx.systemSetting.create({
          data: { name: 'Next.js Starter Template' },
        });
      }
      console.log('Settings seeded.');

      console.log('Database seeding completed!');
    },
    {
      timeout: 520000,
      maxWait: 520000,
    },
  );
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
