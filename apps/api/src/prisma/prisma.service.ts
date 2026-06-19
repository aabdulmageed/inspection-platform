import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }

  /**
   * MVP helper: resolve the single tenant. Replaced by the authenticated
   * user's tenant once JWT auth is wired in.
   */
  async currentTenantId(): Promise<string> {
    const tenant = await this.tenant.findFirst();
    if (!tenant) throw new Error("No tenant found. Run the seed first.");
    return tenant.id;
  }
}
