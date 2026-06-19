import { Discipline, Role } from "@prisma/client";

/** Decoded JWT payload, attached to the request as `req.user`. */
export interface AuthUser {
  sub: string; // user id
  tenantId: string;
  role: Role;
  discipline: Discipline | null;
  name: string;
  email: string;
}
