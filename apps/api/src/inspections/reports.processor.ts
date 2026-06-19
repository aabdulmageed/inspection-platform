import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { InspectionsService } from "./inspections.service";

export interface ReportJob {
  tenantId: string;
  inspectionId: string;
  lang: "en" | "ar";
}

@Processor("reports")
export class ReportsProcessor extends WorkerHost {
  private readonly log = new Logger(ReportsProcessor.name);

  constructor(private readonly inspections: InspectionsService) {
    super();
  }

  async process(job: Job<ReportJob>) {
    const { tenantId, inspectionId, lang } = job.data;
    this.log.log(`Rendering report for ${inspectionId} (${lang})…`);
    await this.inspections.report(tenantId, inspectionId, lang);
    this.log.log(`Report ready for ${inspectionId}`);
  }
}
