import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AuthUser } from "./auth.types";

/** Marks a route as not requiring authentication (e.g. login, health). */
export const IS_PUBLIC = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restricts a route to one or more roles. */
export const ROLES_KEY = "roles";
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Injects the authenticated user (from the JWT) into a handler param. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    return ctx.switchToHttp().getRequest().user;
  },
);
