import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { InspectionsController } from "./inspections.controller";
import { InspectionsService } from "./inspections.service";
import { ReportsProcessor } from "./reports.processor";

@Module({
  imports: [BullModule.registerQueue({ name: "reports" })],
  controllers: [InspectionsController],
  providers: [InspectionsService, ReportsProcessor],
})
export class InspectionsModule {}
