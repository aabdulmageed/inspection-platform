import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString } from "class-validator";
import { PrismaService } from "../prisma/prisma.service";
import { CurrentUser } from "../auth/decorators";
import { AuthUser } from "../auth/auth.types";

class CreateClientBody {
  @IsString() name!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
}

@ApiTags("clients")
@ApiBearerAuth()
@Controller("clients")
export class ClientsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.client.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { name: "asc" },
    });
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateClientBody) {
    return this.prisma.client.create({ data: { ...body, tenantId: user.tenantId } });
  }
}
