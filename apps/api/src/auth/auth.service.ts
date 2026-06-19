import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { User } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { AuthUser } from "./auth.types";

const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? "dev_refresh_secret_change_me";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid email or password");
    }
    return this.issueTokens(user);
  }

  /** Exchange a valid refresh token for a fresh access+refresh pair (rotation). */
  async refresh(refreshToken: string) {
    let decoded: { sub: string; type?: string };
    try {
      decoded = await this.jwt.verifyAsync(refreshToken, { secret: REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
    if (decoded.type !== "refresh") throw new UnauthorizedException("Not a refresh token");

    // Re-load the user so role/discipline changes take effect on refresh.
    const user = await this.prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user) throw new UnauthorizedException("Unknown user");
    return this.issueTokens(user);
  }

  private async issueTokens(user: User) {
    const payload: AuthUser = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      discipline: user.discipline,
      name: user.name,
      email: user.email,
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload), // short-lived (module default)
      this.jwt.signAsync({ sub: user.id, type: "refresh" }, { secret: REFRESH_SECRET, expiresIn: "7d" }),
    ]);
    return {
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, role: user.role, discipline: user.discipline },
    };
  }
}
