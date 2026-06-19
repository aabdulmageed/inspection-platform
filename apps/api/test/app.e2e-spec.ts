import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { AppModule } from "../src/app.module";

/**
 * E2E tests for the platform's core business rules.
 * Requires the dev infra running: postgres, minio, redis (docker compose).
 */
describe("Inspection platform (e2e)", () => {
  let app: INestApplication;
  let http: any;
  const prisma = new PrismaClient();

  // Unique suffix so repeated runs never collide.
  const run = `e2e${Date.now()}`;
  const PASSWORD = "password123";
  let tenantA: string;
  let tenantB: string;
  let inspectionId: string;
  let civilItemId: string;
  const tokens: Record<string, string> = {};

  const email = (name: string) => `${name}-${run}@test.local`;

  async function login(name: string): Promise<string> {
    if (tokens[name]) return tokens[name];
    const res = await request(http)
      .post("/auth/login")
      .send({ email: email(name), password: PASSWORD });
    expect(res.status).toBe(201);
    tokens[name] = res.body.accessToken;
    return tokens[name];
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    http = app.getHttpServer();

    // --- Seed two tenants with users and one inspection in tenant A ---------
    const hash = await bcrypt.hash(PASSWORD, 10);
    const tA = await prisma.tenant.create({ data: { name: `Tenant A ${run}` } });
    const tB = await prisma.tenant.create({ data: { name: `Tenant B ${run}` } });
    tenantA = tA.id;
    tenantB = tB.id;

    const mk = (tenantId: string, name: string, role: any, discipline?: any) =>
      prisma.user.create({
        data: { tenantId, role, discipline: discipline ?? null, name, email: email(name), passwordHash: hash },
      });

    const adminA = await mk(tenantA, "adminA", "ADMIN");
    const civilA = await mk(tenantA, "civilA", "INSPECTOR", "CIVIL");
    await mk(tenantA, "elecA", "INSPECTOR", "ELECTRICAL");
    await mk(tenantA, "managerA", "MANAGER");
    await mk(tenantB, "adminB", "ADMIN");

    const client = await prisma.client.create({
      data: { tenantId: tenantA, name: "E2E Client", email: email("client") },
    });
    const property = await prisma.property.create({
      data: { tenantId: tenantA, clientId: client.id, address: "1 Test St", type: "House" },
    });
    const inspection = await prisma.inspection.create({
      data: {
        tenantId: tenantA,
        propertyId: property.id,
        type: "pre-purchase",
        status: "IN_PROGRESS",
        createdById: adminA.id,
        assignments: { create: [{ inspectorId: civilA.id, discipline: "CIVIL" }] },
      },
    });
    inspectionId = inspection.id;

    const room = await prisma.room.create({ data: { inspectionId, name: "Test Room" } });
    const item = await prisma.item.create({
      data: { roomId: room.id, discipline: "CIVIL", component: "Walls" },
    });
    civilItemId = item.id;
  });

  afterAll(async () => {
    // Clean up everything this run created (delete order respects FKs).
    for (const tenantId of [tenantA, tenantB]) {
      const inspections = await prisma.inspection.findMany({ where: { tenantId }, select: { id: true } });
      const ids = inspections.map((i) => i.id);
      await prisma.signature.deleteMany({ where: { inspectionId: { in: ids } } });
      await prisma.photo.deleteMany({ where: { item: { room: { inspectionId: { in: ids } } } } });
      await prisma.item.deleteMany({ where: { room: { inspectionId: { in: ids } } } });
      await prisma.room.deleteMany({ where: { inspectionId: { in: ids } } });
      await prisma.assignment.deleteMany({ where: { inspectionId: { in: ids } } });
      await prisma.report.deleteMany({ where: { inspectionId: { in: ids } } });
      await prisma.inspection.deleteMany({ where: { tenantId } });
      await prisma.property.deleteMany({ where: { tenantId } });
      await prisma.client.deleteMany({ where: { tenantId } });
      await prisma.checklistTemplate.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenant.delete({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
    await app.close();
  });

  it("rejects unauthenticated requests", async () => {
    await request(http).get("/inspections").expect(401);
  });

  it("rejects bad credentials", async () => {
    await request(http)
      .post("/auth/login")
      .send({ email: email("adminA"), password: "wrong-password" })
      .expect(401);
  });

  it("issues and rotates refresh tokens", async () => {
    const res = await request(http)
      .post("/auth/login")
      .send({ email: email("adminA"), password: PASSWORD })
      .expect(201);
    expect(res.body.refreshToken).toBeDefined();
    const ref = await request(http)
      .post("/auth/refresh")
      .send({ refreshToken: res.body.refreshToken })
      .expect(201);
    expect(ref.body.accessToken).toBeDefined();
    await request(http).post("/auth/refresh").send({ refreshToken: "garbage" }).expect(401);
  });

  it("forbids inspectors from creating inspections (RBAC)", async () => {
    const tok = await login("civilA");
    await request(http)
      .post("/inspections")
      .set("Authorization", `Bearer ${tok}`)
      .send({ propertyId: "x", type: "pre-purchase" })
      .expect(403);
  });

  it("enforces discipline ownership on items", async () => {
    const elec = await login("elecA");
    await request(http)
      .patch(`/items/${civilItemId}`)
      .set("Authorization", `Bearer ${elec}`)
      .send({ status: "ISSUE", note: "not mine" })
      .expect(403);

    const civil = await login("civilA");
    const ok = await request(http)
      .patch(`/items/${civilItemId}`)
      .set("Authorization", `Bearer ${civil}`)
      .send({ status: "GOOD", note: "checked" })
      .expect(200);
    expect(ok.body.status).toBe("GOOD");
  });

  it("isolates tenants", async () => {
    const adminB = await login("adminB");
    await request(http)
      .get(`/inspections/${inspectionId}`)
      .set("Authorization", `Bearer ${adminB}`)
      .expect(404);
  });

  it("runs the full review workflow: sign → review → changes → re-sign → approve", async () => {
    const civil = await login("civilA");
    const adminA = await login("adminA");
    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const sign = (token: string) =>
      request(http)
        .post(`/inspections/${inspectionId}/sign`)
        .set("Authorization", `Bearer ${token}`)
        .send({ imageData: tinyPng });
    const detail = () =>
      request(http).get(`/inspections/${inspectionId}`).set("Authorization", `Bearer ${adminA}`);

    // Manager cannot approve before the team has signed (admin can — tested separately).
    const managerA = await login("managerA");
    await request(http)
      .post(`/inspections/${inspectionId}/sign`)
      .set("Authorization", `Bearer ${managerA}`)
      .send({ imageData: tinyPng })
      .expect(400);

    // Inspector signs (single discipline) → IN_REVIEW, not COMPLETED.
    const r1 = await sign(civil).expect(201);
    expect(r1.body.allSigned).toBe(true);
    expect((await detail()).body.status).toBe("IN_REVIEW");

    // Manager requests changes → back to IN_PROGRESS, signatures cleared.
    await request(http)
      .post(`/inspections/${inspectionId}/request-changes`)
      .set("Authorization", `Bearer ${adminA}`)
      .send({ text: "Please re-check the wall crack photos", discipline: "CIVIL" })
      .expect(201);
    const afterChanges = (await detail()).body;
    expect(afterChanges.status).toBe("IN_PROGRESS");
    expect(afterChanges.signatures).toHaveLength(0);
    expect(afterChanges.reviewComments).toHaveLength(1);
    expect(afterChanges.assignments[0].status).toBe("IN_PROGRESS");

    // Inspector cannot request changes (manager-only).
    await request(http)
      .post(`/inspections/${inspectionId}/request-changes`)
      .set("Authorization", `Bearer ${civil}`)
      .send({ text: "nope" })
      .expect(403);

    // Inspector re-signs → IN_REVIEW again; manager approves → COMPLETED.
    await sign(civil).expect(201);
    expect((await detail()).body.status).toBe("IN_REVIEW");
    const approve = await sign(adminA).expect(201);
    expect(approve.body.approved).toBe(true);
    const final = (await detail()).body;
    expect(final.status).toBe("COMPLETED");
    expect(final.signatures).toHaveLength(2); // inspector + manager
    expect(final.signatures.some((s: any) => s.isManager)).toBe(true);

    // --- Locked after approval: edits, re-sign, and send-back all rejected ---
    const itemId = final.rooms[0].items[0].id;
    await request(http)
      .patch(`/items/${itemId}`)
      .set("Authorization", `Bearer ${civil}`)
      .send({ status: "ISSUE" })
      .expect(403);
    await sign(civil).expect(403);
    await request(http)
      .post(`/inspections/${inspectionId}/request-changes`)
      .set("Authorization", `Bearer ${adminA}`)
      .send({ text: "too late" })
      .expect(400);
  });

  it("lets an admin approve directly, bypassing inspector signatures", async () => {
    // Fresh inspection in tenant A, still IN_PROGRESS (no inspector signed).
    const property = await prisma.property.findFirst({ where: { tenantId: tenantA } });
    const adminUser = await prisma.user.findFirst({ where: { tenantId: tenantA, role: "ADMIN" } });
    const civilUser = await prisma.user.findFirst({ where: { tenantId: tenantA, discipline: "CIVIL" } });
    const fresh = await prisma.inspection.create({
      data: {
        tenantId: tenantA,
        propertyId: property!.id,
        type: "pre-purchase",
        status: "IN_PROGRESS",
        createdById: adminUser!.id,
        assignments: { create: [{ inspectorId: civilUser!.id, discipline: "CIVIL" }] },
      },
    });

    const adminA = await login("adminA");
    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const res = await request(http)
      .post(`/inspections/${fresh.id}/sign`)
      .set("Authorization", `Bearer ${adminA}`)
      .send({ imageData: tinyPng })
      .expect(201);
    expect(res.body.approved).toBe(true);

    const detail = await request(http)
      .get(`/inspections/${fresh.id}`)
      .set("Authorization", `Bearer ${adminA}`)
      .expect(200);
    expect(detail.body.status).toBe("COMPLETED");
    // Only the admin's approval signature exists — no inspector signed.
    expect(detail.body.signatures).toHaveLength(1);
    expect(detail.body.signatures[0].isManager).toBe(true);
  });
});
