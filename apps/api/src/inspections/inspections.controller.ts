import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
  UploadedFile, UseInterceptors, BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsEnum, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { Discipline, ItemStatus } from "@prisma/client";
import { InspectionsService } from "./inspections.service";
import { CurrentUser, Roles } from "../auth/decorators";
import { AuthUser } from "../auth/auth.types";

class CreateInspectionBody {
  @IsString() propertyId!: string;
  @IsString() type!: string;
  @IsOptional() @IsString() scheduledAt?: string;
}
class AssignBody {
  @IsString() inspectorId!: string;
  @IsEnum(Discipline) discipline!: Discipline;
}
class CustomerInput {
  @IsString() name!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
}
class PropertyInput {
  @IsString() address!: string;
  @IsString() type!: string;
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
}
class CreateFullBody {
  @ValidateNested() @Type(() => CustomerInput) customer!: CustomerInput;
  @ValidateNested() @Type(() => PropertyInput) property!: PropertyInput;
  @IsString() type!: string;
  @IsOptional() @IsString() scheduledAt?: string; // YYYY-MM-DD or ISO
  @IsArray() @ValidateNested({ each: true }) @Type(() => AssignBody) assignments!: AssignBody[];
}
class CreateDraftBody {
  @ValidateNested() @Type(() => CustomerInput) customer!: CustomerInput;
  @ValidateNested() @Type(() => PropertyInput) property!: PropertyInput;
  @IsString() type!: string;
}
class AssignTeamBody {
  @IsOptional() @IsString() scheduledAt?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => AssignBody) assignments!: AssignBody[];
}
class UpdateItemBody {
  @IsOptional() @IsEnum(ItemStatus) status?: ItemStatus;
  @IsOptional() @IsString() note?: string;
}
class SignBody {
  @IsString() imageData!: string; // png/jpeg data URI drawn on the client
}
class RequestChangesBody {
  @IsString() text!: string;
  @IsOptional() @IsEnum(Discipline) discipline?: Discipline;
}
class AddRoomBody {
  @IsString() name!: string;
}
class AddItemBody {
  @IsString() component!: string;
  @IsOptional() @IsEnum(Discipline) discipline?: Discipline;
}

@ApiTags("inspections")
@ApiBearerAuth()
@Controller()
export class InspectionsController {
  constructor(
    private readonly svc: InspectionsService,
    @InjectQueue("reports") private readonly reportsQueue: Queue,
  ) {}

  @Get("inspections")
  list(@CurrentUser() user: AuthUser) {
    return this.svc.list(user.tenantId);
  }

  @Get("agenda")
  agenda(@CurrentUser() user: AuthUser, @Query("date") date: string) {
    return this.svc.agenda(user, date || new Date().toISOString().slice(0, 10));
  }

  @Get("inspections/:id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.svc.get(user.tenantId, id);
  }

  @Roles("ADMIN", "MANAGER")
  @Delete("inspections/:id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.svc.remove(user.tenantId, id);
  }

  @Roles("ADMIN", "MANAGER")
  @Post("inspections")
  create(@CurrentUser() user: AuthUser, @Body() b: CreateInspectionBody) {
    return this.svc.create(user, b.propertyId, b.type, b.scheduledAt);
  }

  @Roles("ADMIN", "MANAGER")
  @Post("inspections/full")
  createFull(@CurrentUser() user: AuthUser, @Body() b: CreateFullBody) {
    return this.svc.createFull(user, b);
  }

  @Roles("ADMIN", "MANAGER")
  @Post("inspections/draft")
  createDraft(@CurrentUser() user: AuthUser, @Body() b: CreateDraftBody) {
    return this.svc.createDraft(user, b);
  }

  @Roles("ADMIN", "MANAGER")
  @Post("inspections/:id/assign")
  assignTeam(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() b: AssignTeamBody) {
    return this.svc.assignTeam(user, id, b.scheduledAt, b.assignments);
  }

  @Roles("ADMIN", "MANAGER")
  @Post("inspections/:id/assignments")
  assign(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() b: AssignBody) {
    return this.svc.assign(user.tenantId, id, b.inspectorId, b.discipline);
  }

  @Post("inspections/:id/rooms")
  addRoom(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() b: AddRoomBody) {
    return this.svc.addRoom(user, id, b.name);
  }

  @Post("rooms/:roomId/items")
  addItem(@CurrentUser() user: AuthUser, @Param("roomId") roomId: string, @Body() b: AddItemBody) {
    return this.svc.addItem(user, roomId, b.component, b.discipline);
  }

  @Patch("items/:itemId")
  updateItem(@CurrentUser() user: AuthUser, @Param("itemId") itemId: string, @Body() b: UpdateItemBody) {
    return this.svc.updateItem(user, itemId, b);
  }

  @Post("items/:itemId/photos")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 25 * 1024 * 1024 } }))
  uploadPhoto(
    @CurrentUser() user: AuthUser,
    @Param("itemId") itemId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("file is required");
    return this.svc.addPhoto(user, itemId, file.buffer);
  }

  @Post("inspections/:id/sign")
  sign(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() b: SignBody) {
    return this.svc.sign(user, id, b.imageData);
  }

  @Roles("ADMIN", "MANAGER")
  @Post("inspections/:id/request-changes")
  requestChanges(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() b: RequestChangesBody) {
    return this.svc.requestChanges(user, id, b.text, b.discipline);
  }

  @Delete("photos/:photoId")
  deletePhoto(@CurrentUser() user: AuthUser, @Param("photoId") photoId: string) {
    return this.svc.deletePhoto(user, photoId);
  }

  @Roles("ADMIN", "MANAGER")
  @Post("inspections/:id/email-report")
  emailReport(@CurrentUser() user: AuthUser, @Param("id") id: string, @Query("lang") lang = "en") {
    return this.svc.emailReport(user.tenantId, id, lang === "ar" ? "ar" : "en");
  }

  @Roles("ADMIN", "MANAGER")
  @Post("inspections/:id/report")
  async report(@CurrentUser() user: AuthUser, @Param("id") id: string, @Query("lang") lang = "en") {
    // Verify access before enqueueing.
    await this.svc.get(user.tenantId, id);
    const job = await this.reportsQueue.add(
      "generate",
      { tenantId: user.tenantId, inspectionId: id, lang: lang === "ar" ? "ar" : "en" },
      { attempts: 3, backoff: { type: "exponential", delay: 3000 }, removeOnComplete: 50, removeOnFail: 20 },
    );
    return { queued: true, jobId: job.id };
  }
}
