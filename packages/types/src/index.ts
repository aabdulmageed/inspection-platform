import { z } from "zod";

/**
 * Shared domain enums + DTO schemas, used by both the web app and the API.
 * Mobile (Swift/Kotlin) consumes the equivalent definitions via the API's
 * generated OpenAPI spec.
 */

// --- Enums (mirror the Prisma schema) --------------------------------------
export const Role = z.enum(["ADMIN", "MANAGER", "INSPECTOR"]);
export type Role = z.infer<typeof Role>;

export const Discipline = z.enum([
  "CIVIL",
  "ELECTRICAL",
  "PLUMBING",
  "PEST_OTHER",
]);
export type Discipline = z.infer<typeof Discipline>;

export const InspectionStatus = z.enum([
  "DRAFT",
  "IN_PROGRESS",
  "COMPLETED",
  "REPORTED",
]);
export type InspectionStatus = z.infer<typeof InspectionStatus>;

export const AssignmentStatus = z.enum(["PENDING", "IN_PROGRESS", "SIGNED"]);
export type AssignmentStatus = z.infer<typeof AssignmentStatus>;

export const ItemStatus = z.enum(["GOOD", "ISSUE", "NA"]);
export type ItemStatus = z.infer<typeof ItemStatus>;

export const Language = z.enum(["en", "ar"]);
export type Language = z.infer<typeof Language>;

// --- DTOs -------------------------------------------------------------------
export const CreateClientDto = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
});
export type CreateClientDto = z.infer<typeof CreateClientDto>;

export const CreatePropertyDto = z.object({
  clientId: z.string(),
  address: z.string().min(1),
  type: z.string().min(1),
});
export type CreatePropertyDto = z.infer<typeof CreatePropertyDto>;

export const CreateInspectionDto = z.object({
  propertyId: z.string(),
  type: z.string().min(1), // e.g. "pre-purchase", "dilapidation"
  scheduledAt: z.string().datetime().optional(),
});
export type CreateInspectionDto = z.infer<typeof CreateInspectionDto>;

export const CreateAssignmentDto = z.object({
  inspectorId: z.string(),
  discipline: Discipline,
});
export type CreateAssignmentDto = z.infer<typeof CreateAssignmentDto>;

export const UpdateItemDto = z.object({
  status: ItemStatus.optional(),
  note: z.string().optional(),
});
export type UpdateItemDto = z.infer<typeof UpdateItemDto>;
