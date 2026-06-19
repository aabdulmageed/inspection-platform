import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { BullModule } from "@nestjs/bullmq";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { StorageModule } from "./storage/storage.module";
import { MailModule } from "./mail/mail.module";
import { HealthController } from "./health/health.controller";
import { ClientsModule } from "./clients/clients.module";
import { InspectionsModule } from "./inspections/inspections.module";
import { UsersModule } from "./users/users.module";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { RolesGuard } from "./auth/roles.guard";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global rate limit: 200 requests/min per IP (login is stricter, see AuthController).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 200 }]),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? "localhost",
        port: Number(process.env.REDIS_PORT ?? 6379),
        // Managed Redis (e.g. Azure Cache for Redis) needs auth + TLS.
        password: process.env.REDIS_PASSWORD || undefined,
        ...(process.env.REDIS_TLS === "true" ? { tls: {} } : {}),
      },
    }),
    PrismaModule,
    StorageModule,
    MailModule,
    AuthModule,
    ClientsModule,
    InspectionsModule,
    UsersModule,
  ],
  controllers: [HealthController],
  providers: [
    // Rate limiting first, then auth (sets req.user), then role checks.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
