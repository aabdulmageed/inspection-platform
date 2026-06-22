import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { Discipline } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { MailService } from "../mail/mail.service";
import { AuthUser } from "../auth/auth.types";

@Injectable()
export class InspectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
  ) {}

  async list(tenantId: string) {
    const rows = await this.prisma.inspection.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      include: {
        property: { include: { client: true } },
        assignments: { include: { inspector: true } },
        rooms: { select: { items: { select: { status: true } } } },
      },
    });
    // Flatten per-item status into lightweight counts; drop the heavy rooms payload.
    return rows.map(({ rooms, ...rest }) => {
      const items = rooms.flatMap((r) => r.items);
      return {
        ...rest,
        itemsCount: items.length,
        issuesCount: items.filter((i) => i.status === "ISSUE").length,
      };
    });
  }

  /**
   * The day's scheduled jobs. Inspectors see only jobs assigned to them;
   * managers/admins see the whole day. `date` is YYYY-MM-DD (treated as UTC).
   */
  async agenda(user: AuthUser, date: string) {
    const day = new Date(`${date}T00:00:00.000Z`);
    if (isNaN(day.getTime())) throw new BadRequestException("Invalid date");
    const next = new Date(day);
    next.setUTCDate(day.getUTCDate() + 1);

    const where: any = {
      tenantId: user.tenantId,
      scheduledAt: { gte: day, lt: next },
    };
    if (user.role === "INSPECTOR") {
      where.assignments = { some: { inspectorId: user.sub } };
    }

    const rows = await this.prisma.inspection.findMany({
      where,
      orderBy: { scheduledAt: "asc" },
      include: {
        property: { include: { client: true } },
        assignments: { include: { inspector: true } },
      },
    });

    // For inspectors, surface their own discipline's status on each job.
    return rows.map((r) => ({
      ...r,
      myStatus:
        user.role === "INSPECTOR"
          ? r.assignments.find((a) => a.inspectorId === user.sub)?.status ?? null
          : null,
    }));
  }

  async get(tenantId: string, id: string) {
    const inspection = await this.prisma.inspection.findFirst({
      where: { id, tenantId },
      include: {
        property: { include: { client: true } },
        assignments: { include: { inspector: true } },
        rooms: { orderBy: { order: "asc" }, include: { items: { include: { photos: true } } } },
        signatures: true,
        reviewComments: { orderBy: { createdAt: "desc" } },
        report: true,
      },
    });
    if (!inspection) throw new NotFoundException("Inspection not found");
    return inspection;
  }

  /** Page 1: create the customer + property as a DRAFT job (no team yet). */
  async createDraft(
    user: AuthUser,
    dto: {
      customer: { name: string; phone?: string; email?: string };
      property: { address: string; type: string; latitude?: number; longitude?: number };
      type: string;
    },
  ) {
    const client = await this.prisma.client.create({
      data: { tenantId: user.tenantId, name: dto.customer.name, phone: dto.customer.phone, email: dto.customer.email },
    });
    const property = await this.prisma.property.create({
      data: {
        tenantId: user.tenantId,
        clientId: client.id,
        address: dto.property.address,
        type: dto.property.type,
        latitude: dto.property.latitude ?? null,
        longitude: dto.property.longitude ?? null,
      },
    });
    return this.prisma.inspection.create({
      data: { tenantId: user.tenantId, propertyId: property.id, type: dto.type, status: "DRAFT", createdById: user.sub },
    });
  }

  /** Page 2: assign the team + schedule (also used to reschedule/reassign). */
  async assignTeam(
    user: AuthUser,
    id: string,
    scheduledAt: string | undefined,
    assignments: { inspectorId: string; discipline: Discipline }[],
  ) {
    await this.assertNotLocked(id);
    if (scheduledAt) {
      await this.prisma.inspection.update({ where: { id }, data: { scheduledAt: new Date(scheduledAt) } });
    }
    for (const a of assignments) {
      await this.assign(user.tenantId, id, a.inspectorId, a.discipline);
    }
    await this.prisma.inspection.update({ where: { id }, data: { status: "IN_PROGRESS" } });

    // Notify each assigned inspector (best-effort).
    const insp = await this.get(user.tenantId, id);
    const dateLabel = insp.scheduledAt ? new Date(insp.scheduledAt).toLocaleDateString("en-AU") : "TBD";
    for (const a of assignments) {
      const u = await this.prisma.user.findUnique({ where: { id: a.inspectorId } });
      if (u?.email) void this.mail.sendAssignmentEmail(u.email, u.name, insp.property.address, dateLabel, "en");
    }
    return insp;
  }

  /** Create a client + property + inspection + assignments in one call. */
  async createFull(
    user: AuthUser,
    dto: {
      customer: { name: string; phone?: string; email?: string };
      property: { address: string; type: string; latitude?: number; longitude?: number };
      type: string;
      scheduledAt?: string;
      assignments: { inspectorId: string; discipline: Discipline }[];
    },
  ) {
    const client = await this.prisma.client.create({
      data: { tenantId: user.tenantId, name: dto.customer.name, phone: dto.customer.phone, email: dto.customer.email },
    });
    const property = await this.prisma.property.create({
      data: {
        tenantId: user.tenantId,
        clientId: client.id,
        address: dto.property.address,
        type: dto.property.type,
        latitude: dto.property.latitude ?? null,
        longitude: dto.property.longitude ?? null,
      },
    });
    const inspection = await this.prisma.inspection.create({
      data: {
        tenantId: user.tenantId,
        propertyId: property.id,
        type: dto.type,
        status: "IN_PROGRESS",
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        createdById: user.sub,
      },
    });
    for (const a of dto.assignments) {
      await this.assign(user.tenantId, inspection.id, a.inspectorId, a.discipline);
    }
    return inspection;
  }

  /** Delete an inspection (cascades to rooms, items, photos, signatures, report). */
  async remove(tenantId: string, id: string) {
    const insp = await this.prisma.inspection.findFirst({ where: { id, tenantId } });
    if (!insp) throw new NotFoundException("Inspection not found");
    await this.prisma.inspection.delete({ where: { id } });
    return { deleted: true };
  }

  create(user: AuthUser, propertyId: string, type: string, scheduledAt?: string) {
    return this.prisma.inspection.create({
      data: {
        tenantId: user.tenantId,
        propertyId,
        type,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        createdById: user.sub,
      },
    });
  }

  /**
   * Assign an inspector for a discipline. The inspection starts with no rooms or
   * checks — each inspector builds their own rooms and checks on site (via the
   * web or the mobile apps), so no checklist template is auto-applied here.
   */
  async assign(tenantId: string, inspectionId: string, inspectorId: string, discipline: Discipline) {
    const inspection = await this.prisma.inspection.findFirst({ where: { id: inspectionId, tenantId } });
    if (!inspection) throw new NotFoundException("Inspection not found");

    return this.prisma.assignment.upsert({
      where: { inspectionId_discipline: { inspectionId, discipline } },
      update: { inspectorId },
      create: { inspectionId, inspectorId, discipline },
    });
  }

  /** Once a report is approved (COMPLETED) or issued (REPORTED) it is locked. */
  private async assertNotLocked(inspectionId: string) {
    const insp = await this.prisma.inspection.findUniqueOrThrow({ where: { id: inspectionId } });
    if (insp.status === "COMPLETED" || insp.status === "REPORTED") {
      throw new ForbiddenException("This inspection has been approved and is locked");
    }
  }

  /** An inspector may only edit items belonging to their own discipline. */
  async updateItem(user: AuthUser, itemId: string, data: { status?: any; note?: string }) {
    const item = await this.prisma.item.findUnique({ where: { id: itemId }, include: { room: true } });
    if (!item) throw new NotFoundException("Item not found");
    await this.assertNotLocked(item.room.inspectionId);
    if (user.role === "INSPECTOR" && user.discipline !== item.discipline) {
      throw new ForbiddenException(
        `Your discipline (${user.discipline}) cannot edit a ${item.discipline} item`,
      );
    }
    return this.prisma.item.update({
      where: { id: itemId },
      data: { ...data, updatedById: user.sub },
    });
  }

  /** Upload a photo to an item: EXIF-correct, resized, stored, linked. */
  async addPhoto(user: AuthUser, itemId: string, file: Buffer, note?: string) {
    const item = await this.prisma.item.findUnique({ where: { id: itemId }, include: { photos: true, room: true } });
    if (!item) throw new NotFoundException("Item not found");
    await this.assertNotLocked(item.room.inspectionId);
    if (user.role === "INSPECTOR" && user.discipline !== item.discipline) {
      throw new ForbiddenException("Cannot add photos to another discipline's item");
    }

    // Auto-rotate from EXIF, downscale, re-encode as JPEG.
    const processed = await sharp(file)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    const meta = await sharp(processed).metadata();

    const key = `items/${itemId}/${randomUUID()}.jpg`;
    const url = await this.storage.upload(key, processed, "image/jpeg");

    return this.prisma.photo.create({
      data: {
        itemId,
        url,
        note: note?.trim() || null,
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        order: item.photos.length,
      },
    });
  }

  /** Update a photo's caption/note (same access rules as deleting it). */
  async updatePhoto(user: AuthUser, photoId: string, note: string) {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
      include: { item: { include: { room: true } } },
    });
    if (!photo) throw new NotFoundException("Photo not found");
    await this.assertNotLocked(photo.item.room.inspectionId);
    if (user.role === "INSPECTOR" && user.discipline !== photo.item.discipline) {
      throw new ForbiddenException("Cannot edit another discipline's photo");
    }
    return this.prisma.photo.update({
      where: { id: photoId },
      data: { note: note.trim() || null },
    });
  }

  /**
   * Record a signature drawn on the client (base64 PNG data URI).
   * - INSPECTOR: signs their own discipline. When every discipline has signed,
   *   the inspection moves to IN_REVIEW (waiting for manager).
   * - ADMIN/MANAGER: the final approval signature — only possible once the
   *   inspection is IN_REVIEW; moves it to COMPLETED.
   */
  async sign(user: AuthUser, inspectionId: string, imageData: string) {
    const match = /^data:image\/(png|jpeg);base64,(.+)$/.exec(imageData);
    if (!match) throw new BadRequestException("imageData must be a png/jpeg data URI");
    const buffer = Buffer.from(match[2], "base64");

    // --- Manager / admin: final approval ------------------------------------
    if (user.role === "ADMIN" || user.role === "MANAGER") {
      const insp = await this.prisma.inspection.findUniqueOrThrow({ where: { id: inspectionId } });
      if (insp.status === "COMPLETED" || insp.status === "REPORTED") {
        throw new ForbiddenException("This inspection has been approved and is locked");
      }
      // Managers must wait for review; an ADMIN can approve at any stage,
      // bypassing pending inspector signatures (admin override).
      if (user.role === "MANAGER" && insp.status !== "IN_REVIEW") {
        throw new BadRequestException("The inspection must be in review before final approval");
      }
      const key = `signatures/${inspectionId}/manager.png`;
      const imageUrl = await this.storage.upload(key, buffer, `image/${match[1]}`);
      await this.prisma.signature.create({
        data: { inspectionId, imageUrl, isManager: true },
      });
      await this.prisma.inspection.update({ where: { id: inspectionId }, data: { status: "COMPLETED" } });
      return { approved: true };
    }

    // --- Inspector: discipline signature ------------------------------------
    if (!user.discipline) {
      throw new BadRequestException("Only an inspector with a discipline can sign their section");
    }
    await this.assertNotLocked(inspectionId);
    const discipline = user.discipline;
    await this.prisma.assignment.update({
      where: { inspectionId_discipline: { inspectionId, discipline } },
      data: { status: "SIGNED" },
    });

    const key = `signatures/${inspectionId}/${discipline}.png`;
    const imageUrl = await this.storage.upload(key, buffer, `image/${match[1]}`);
    await this.prisma.signature.create({ data: { inspectionId, imageUrl, discipline } });

    const assignments = await this.prisma.assignment.findMany({ where: { inspectionId } });
    const allSigned = assignments.length > 0 && assignments.every((a) => a.status === "SIGNED");
    if (allSigned) {
      await this.prisma.inspection.update({ where: { id: inspectionId }, data: { status: "IN_REVIEW" } });
    }
    return { allSigned };
  }

  /**
   * Manager review: write a comment and send the inspection back to the
   * inspector(s). Targets one discipline or, if none given, the whole team.
   * The targeted assignments revert to IN_PROGRESS and their signatures (and
   * any manager signature) are removed so the work is re-signed after fixes.
   */
  async requestChanges(user: AuthUser, inspectionId: string, text: string, discipline?: Discipline) {
    const insp = await this.prisma.inspection.findUniqueOrThrow({ where: { id: inspectionId } });
    if (insp.status !== "IN_REVIEW") {
      throw new BadRequestException("Only an inspection under review can be sent back");
    }

    await this.prisma.reviewComment.create({
      data: { inspectionId, authorId: user.sub, authorName: user.name, discipline: discipline ?? null, text },
    });

    const where = discipline ? { inspectionId, discipline } : { inspectionId };
    await this.prisma.assignment.updateMany({ where, data: { status: "IN_PROGRESS" } });
    await this.prisma.signature.deleteMany({
      where: discipline
        ? { inspectionId, OR: [{ discipline }, { isManager: true }] }
        : { inspectionId },
    });
    await this.prisma.inspection.update({ where: { id: inspectionId }, data: { status: "IN_PROGRESS" } });
    return { sentBack: true };
  }

  /** Add a room not already in the checklist. */
  async addRoom(user: AuthUser, inspectionId: string, name: string) {
    await this.get(user.tenantId, inspectionId); // tenant + existence (throws 404 otherwise)
    await this.assertNotLocked(inspectionId);
    if (user.role === "INSPECTOR") {
      const assigned = await this.prisma.assignment.findFirst({ where: { inspectionId, inspectorId: user.sub } });
      if (!assigned) throw new ForbiddenException("Not assigned to this inspection");
    }
    const order = await this.prisma.room.count({ where: { inspectionId } });
    return this.prisma.room.create({ data: { inspectionId, name, order } });
  }

  /** Add a check (component) not already in a room. */
  async addItem(user: AuthUser, roomId: string, component: string, discipline?: Discipline) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId }, include: { inspection: true } });
    if (!room || room.inspection.tenantId !== user.tenantId) throw new NotFoundException("Room not found");
    await this.assertNotLocked(room.inspectionId);

    let disc: Discipline;
    if (user.role === "INSPECTOR") {
      if (!user.discipline) throw new BadRequestException("Inspector has no discipline");
      const assigned = await this.prisma.assignment.findFirst({
        where: { inspectionId: room.inspectionId, inspectorId: user.sub },
      });
      if (!assigned) throw new ForbiddenException("Not assigned to this inspection");
      disc = user.discipline; // inspectors add under their own discipline
    } else {
      if (!discipline) throw new BadRequestException("discipline is required");
      disc = discipline;
    }
    return this.prisma.item.create({ data: { roomId, discipline: disc, component }, include: { photos: true } });
  }

  /** Remove a photo (e.g. a bad shot) — same ownership rules as editing the item. */
  async deletePhoto(user: AuthUser, photoId: string) {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
      include: { item: { include: { room: true } } },
    });
    if (!photo) throw new NotFoundException("Photo not found");
    await this.assertNotLocked(photo.item.room.inspectionId);
    if (user.role === "INSPECTOR" && user.discipline !== photo.item.discipline) {
      throw new ForbiddenException("Cannot remove another discipline's photo");
    }
    await this.prisma.photo.delete({ where: { id: photoId } });
    await this.storage.deleteByUrl(photo.url);
    return { deleted: true };
  }

  /** Build the report payload and render it via the PDF service. */
  async report(tenantId: string, id: string, lang: "en" | "ar"): Promise<Buffer> {
    const insp = await this.get(tenantId, id);
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const brand = (tenant?.brandJson ?? {}) as { company?: string };

    const DISC: Record<"en" | "ar", Record<string, string>> = {
      en: { CIVIL: "Civil", ELECTRICAL: "Electrical", PLUMBING: "Plumbing", PEST_OTHER: "Pest / Other" },
      ar: { CIVIL: "مدني", ELECTRICAL: "كهرباء", PLUMBING: "سباكة", PEST_OTHER: "آفات / أخرى" },
    };
    const APPROVED = { en: "Approved by", ar: "اعتماد" };
    // Property-type codes localize; legacy free-text values pass through as-is.
    const PTYPE: Record<"en" | "ar", Record<string, string>> = {
      en: { APARTMENT: "Apartment", HOUSE: "House" },
      ar: { APARTMENT: "شقة", HOUSE: "منزل" },
    };

    // Inline photos as data URIs so the PDF service embeds them reliably.
    // Fetch via the internal storage endpoint (matters inside Docker).
    const toDataUri = async (url: string) => {
      try {
        const res = await fetch(this.storage.internalUrl(url));
        const buf = Buffer.from(await res.arrayBuffer());
        return `data:image/jpeg;base64,${buf.toString("base64")}`;
      } catch {
        return url;
      }
    };
    const rooms = await Promise.all(
      insp.rooms.map(async (r) => ({
        name: r.name,
        items: await Promise.all(
          r.items.map(async (it) => ({
            component: it.component,
            discipline: it.discipline,
            status: it.status,
            note: it.note,
            photos: await Promise.all(
              it.photos.map(async (p) => ({ src: await toDataUri(p.url), note: p.note })),
            ),
          })),
        ),
      })),
    );

    const data = {
      lang,
      company: brand.company ?? tenant?.name ?? "CHECK House Inspections",
      property: {
        customer: insp.property.client.name,
        address: insp.property.address,
        type: PTYPE[lang][insp.property.type] ?? insp.property.type,
        date: new Date(insp.createdAt).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-AU"),
      },
      team: insp.assignments.map((a) => ({ discipline: a.discipline, inspector: a.inspector.name })),
      rooms,
      // Inspector signatures + the manager's final approval (customer no longer signs).
      signatures: await Promise.all([
        ...insp.assignments.map(async (a) => {
          const sig = insp.signatures.find((s) => s.discipline === a.discipline);
          return {
            label: `${DISC[lang][a.discipline]} — ${a.inspector.name}`,
            image: sig ? await toDataUri(sig.imageUrl) : undefined,
          };
        }),
        (async () => {
          const sig = insp.signatures.find((s) => s.isManager);
          return { label: APPROVED[lang], image: sig ? await toDataUri(sig.imageUrl) : undefined };
        })(),
      ]),
    };

    const url = (process.env.PDF_SERVICE_URL ?? "http://localhost:4100") + "/render";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("PDF render failed");
    const pdf = Buffer.from(await res.arrayBuffer());

    // Persist the issued report so it can be re-downloaded and emailed.
    const objectKey = `reports/${id}-${lang}-${Date.now()}.pdf`;
    const pdfUrl = await this.storage.upload(objectKey, pdf, "application/pdf");
    await this.prisma.report.upsert({
      where: { inspectionId: id },
      update: { lang, pdfUrl, objectKey, generatedAt: new Date() },
      create: { inspectionId: id, lang, pdfUrl, objectKey },
    });
    await this.prisma.inspection.update({ where: { id }, data: { status: "REPORTED" } });
    return pdf;
  }

  /** Email the latest issued report to the inspection's customer. */
  async emailReport(tenantId: string, id: string, lang: "en" | "ar") {
    const insp = await this.get(tenantId, id);
    const report = await this.prisma.report.findUnique({ where: { inspectionId: id } });
    if (!report?.objectKey) throw new NotFoundException("No report has been generated yet");
    const to = insp.property.client.email;
    if (!to) throw new BadRequestException("The customer has no email address on file");

    const link = await this.storage.presignedGetUrl(report.objectKey);
    await this.mail.sendReportEmail(to, insp.property.client.name, insp.property.address, link, lang);
    return { sent: true, to };
  }
}
