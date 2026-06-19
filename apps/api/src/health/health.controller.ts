import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service";
import { Public } from "../auth/decorators";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: the process is up. Cheap and dependency-free — a database
   *  blip must NOT restart every API pod. */
  @Public()
  @Get()
  live() {
    return { status: "ok", time: new Date().toISOString() };
  }

  /** Readiness: safe to receive traffic — verifies the database is reachable. */
  @Public()
  @Get("ready")
  async ready() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: "ready", time: new Date().toISOString() };
  }
}
