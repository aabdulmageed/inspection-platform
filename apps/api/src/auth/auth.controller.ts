import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { IsEmail, IsString, MinLength } from "class-validator";
import { AuthService } from "./auth.service";
import { CurrentUser, Public } from "./decorators";
import { AuthUser } from "./auth.types";

class LoginBody {
  @IsEmail() email!: string;
  @IsString() @MinLength(6) password!: string;
}
class RefreshBody {
  @IsString() refreshToken!: string;
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Strict limit against credential brute-forcing.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Public()
  @Post("login")
  login(@Body() body: LoginBody) {
    return this.auth.login(body.email, body.password);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Public()
  @Post("refresh")
  refresh(@Body() body: RefreshBody) {
    return this.auth.refresh(body.refreshToken);
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
