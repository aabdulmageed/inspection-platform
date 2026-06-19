import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get,
  NotFoundException, Param, Patch, Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { Discipline, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { CurrentUser, Roles } from "../auth/decorators";
import { AuthUser } from "../auth/auth.types";

class CreateUserBody {
  @IsString() name!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(6) password!: string;
  @IsEnum(Role) role!: Role;
  @IsOptional() @IsEnum(Discipline) discipline?: Discipline;
}

class UpdateUserBody {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsEnum(Discipline) discipline?: Discipline;
  @IsOptional() @IsString() @MinLength(6) password?: string;
}

@ApiTags("users")
@ApiBearerAuth()
@Controller("users")
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles("ADMIN", "MANAGER")
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.user.findMany({
      where: { tenantId: user.tenantId },
      select: { id: true, name: true, email: true, role: true, discipline: true },
      orderBy: { name: "asc" },
    });
  }

  @Roles("ADMIN")
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() b: CreateUserBody) {
    const passwordHash = await bcrypt.hash(b.password, 10);
    const created = await this.prisma.user.create({
      data: {
        tenantId: user.tenantId,
        name: b.name,
        email: b.email,
        passwordHash,
        role: b.role,
        discipline: b.role === "INSPECTOR" ? (b.discipline ?? null) : null,
      },
      select: { id: true, name: true, email: true, role: true, discipline: true },
    });
    return created;
  }

  @Roles("ADMIN")
  @Patch(":id")
  async update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() b: UpdateUserBody) {
    const target = await this.prisma.user.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!target) throw new NotFoundException("User not found");

    const role = b.role ?? target.role;
    const data: Record<string, unknown> = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.role !== undefined) data.role = b.role;
    // Discipline only applies to inspectors; clear it otherwise.
    data.discipline = role === "INSPECTOR" ? (b.discipline ?? target.discipline) : null;
    if (b.password) data.passwordHash = await bcrypt.hash(b.password, 10);

    return this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true, discipline: true },
    });
  }

  @Roles("ADMIN")
  @Delete(":id")
  async remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    if (id === user.sub) throw new BadRequestException("You cannot delete your own account");
    const target = await this.prisma.user.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!target) throw new NotFoundException("User not found");

    const assigned = await this.prisma.assignment.count({ where: { inspectorId: id } });
    if (assigned > 0) {
      throw new ConflictException("User has inspection assignments and cannot be deleted");
    }
    await this.prisma.user.delete({ where: { id } });
    return { deleted: true };
  }
}
