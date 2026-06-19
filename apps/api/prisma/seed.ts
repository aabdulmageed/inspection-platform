import { PrismaClient, Discipline } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Default "pre-purchase" checklist per discipline: which components each
// discipline checks, grouped by room. Tenants can customise these later.
const TEMPLATES: Record<Discipline, { room: string; components: string[] }[]> = {
  CIVIL: [
    { room: "Living Room", components: ["Walls & Ceiling", "Flooring", "Windows", "Doors"] },
    { room: "Kitchen", components: ["Walls & Ceiling", "Cabinetry & Benchtops", "Flooring"] },
    { room: "Master Bedroom", components: ["Walls & Ceiling", "Flooring", "Windows", "Wardrobe & Doors"] },
    { room: "Bathroom", components: ["Walls & Tiling", "Flooring & Grout"] },
  ],
  ELECTRICAL: [
    { room: "Living Room", components: ["Lighting & Power"] },
    { room: "Kitchen", components: ["Electrical & Appliances", "Range Hood & Ventilation"] },
    { room: "Master Bedroom", components: ["Lighting & Power"] },
    { room: "Bathroom", components: ["Exhaust & Ventilation", "Electrical Safety"] },
  ],
  PLUMBING: [
    { room: "Kitchen", components: ["Plumbing (Sink & Taps)"] },
    { room: "Bathroom", components: ["Plumbing (Taps & Drainage)", "Shower & Waterproofing", "Toilet"] },
  ],
  PEST_OTHER: [
    { room: "Living Room", components: ["Pest / Termite Signs"] },
    { room: "Master Bedroom", components: ["Pest / Termite Signs"] },
  ],
};

async function main() {
  // --- Tenant ---------------------------------------------------------------
  const tenant = await prisma.tenant.create({
    data: {
      name: "CHECK House Inspections",
      brandJson: { company: "CHECK House Inspections", navy: "#134486", green: "#39b045" },
    },
  });

  const pw = await bcrypt.hash("password123", 10);

  // --- Users ----------------------------------------------------------------
  await prisma.user.create({
    data: { tenantId: tenant.id, role: "ADMIN", name: "Site Admin", email: "admin@check.test", passwordHash: pw },
  });
  await prisma.user.create({
    data: { tenantId: tenant.id, role: "MANAGER", name: "Ops Manager", email: "manager@check.test", passwordHash: pw },
  });
  const civil = await prisma.user.create({
    data: { tenantId: tenant.id, role: "INSPECTOR", discipline: "CIVIL", name: "Civil Engineer", email: "civil@check.test", passwordHash: pw },
  });
  const electrical = await prisma.user.create({
    data: { tenantId: tenant.id, role: "INSPECTOR", discipline: "ELECTRICAL", name: "Electrical Engineer", email: "electrical@check.test", passwordHash: pw },
  });
  const plumbing = await prisma.user.create({
    data: { tenantId: tenant.id, role: "INSPECTOR", discipline: "PLUMBING", name: "Plumbing Engineer", email: "plumbing@check.test", passwordHash: pw },
  });

  // --- Checklist templates --------------------------------------------------
  for (const discipline of Object.keys(TEMPLATES) as Discipline[]) {
    await prisma.checklistTemplate.create({
      data: {
        tenantId: tenant.id,
        inspectionType: "pre-purchase",
        discipline,
        itemsJson: TEMPLATES[discipline],
      },
    });
  }

  // --- Client + property ----------------------------------------------------
  const client = await prisma.client.create({
    data: { tenantId: tenant.id, name: "John Smith", phone: "+61 400 000 000", email: "john@example.com" },
  });
  const property = await prisma.property.create({
    data: { tenantId: tenant.id, clientId: client.id, address: "42 Greenview Street, Sydney NSW 2000", type: "Single-storey detached house" },
  });

  // --- Sample inspection assigned to civil + electrical + plumbing ----------
  const inspection = await prisma.inspection.create({
    data: {
      tenantId: tenant.id,
      propertyId: property.id,
      type: "pre-purchase",
      status: "IN_PROGRESS",
      createdById: civil.id,
      assignments: {
        create: [
          { inspectorId: civil.id, discipline: "CIVIL", status: "IN_PROGRESS" },
          { inspectorId: electrical.id, discipline: "ELECTRICAL", status: "PENDING" },
          { inspectorId: plumbing.id, discipline: "PLUMBING", status: "PENDING" },
        ],
      },
    },
  });

  // Build rooms + discipline-owned items from the assigned disciplines' templates.
  const assignedDisciplines: Discipline[] = ["CIVIL", "ELECTRICAL", "PLUMBING"];
  const roomNames = [...new Set(assignedDisciplines.flatMap((d) => TEMPLATES[d].map((r) => r.room)))];

  for (const [i, roomName] of roomNames.entries()) {
    const room = await prisma.room.create({
      data: { inspectionId: inspection.id, name: roomName, order: i },
    });
    for (const discipline of assignedDisciplines) {
      const tpl = TEMPLATES[discipline].find((r) => r.room === roomName);
      if (!tpl) continue;
      await prisma.item.createMany({
        data: tpl.components.map((component) => ({ roomId: room.id, discipline, component })),
      });
    }
  }

  console.log("Seed complete. Login with admin@check.test / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
