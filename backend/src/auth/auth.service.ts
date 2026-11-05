import { assertAdmin } from '../common/authorization';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AccountsService } from '../users/accounts.service';
import { lockAccounts } from '../users/account-lock';
import { UsersService, userInclude } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './types/jwt-payload.type';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly accounts: AccountsService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto, actor: AuthenticatedUser) {
    assertAdmin(actor);
    const created = await this.accounts.create(
      {
        ...dto,
        firstName: dto.firstName?.trim() || 'Vendedor',
        role: 'VENDEDOR',
      },
      actor,
    );
    return this.prisma.$transaction(async (tx) => {
      await lockAccounts(tx);
      const user = await tx.user.findUniqueOrThrow({
        where: { id: created.id },
        include: userInclude,
      });
      if (!user.isActive || user.deletedAt)
        throw new UnauthorizedException('Invalid credentials');
      return {
        user: this.usersService.toSafeUser(user),
        ...(await this.issueTokens(user.id, user.email, tx)),
      };
    });
  }

  async login(dto: LoginDto) {
    // Hashing outside the lock avoids serializing costly password comparisons.
    const checked = await this.usersService.findByEmail(
      dto.email.trim().toLowerCase(),
    );
    if (
      !checked ||
      !checked.isActive ||
      checked.deletedAt ||
      !(await bcrypt.compare(dto.password, checked.password))
    )
      throw new UnauthorizedException('Invalid credentials');
    return this.prisma.$transaction(async (tx) => {
      await lockAccounts(tx);
      const user = await tx.user.findUnique({
        where: { id: checked.id },
        include: userInclude,
      });
      if (
        !user ||
        !user.isActive ||
        user.deletedAt ||
        user.password !== checked.password ||
        user.email !== checked.email
      )
        throw new UnauthorizedException('Invalid credentials');
      return {
        user: this.usersService.toSafeUser(user),
        ...(await this.issueTokens(user.id, user.email, tx)),
      };
    });
  }

  async refresh(refreshToken: string) {
    return this.prisma.$transaction(async (tx) => {
      await lockAccounts(tx);
      const stored = await tx.refreshToken.findUnique({
        where: { tokenHash: this.hashToken(refreshToken) },
        include: { user: true },
      });
      if (
        !stored ||
        stored.expiresAt <= new Date() ||
        !stored.user.isActive ||
        stored.user.deletedAt
      )
        throw new UnauthorizedException('Invalid refresh token');
      await tx.refreshToken.delete({ where: { id: stored.id } });
      return this.issueTokens(stored.user.id, stored.user.email, tx);
    });
  }

  async logout(refreshToken: string) {
    return this.prisma.$transaction(async (tx) => {
      await lockAccounts(tx);
      await tx.refreshToken.deleteMany({
        where: { tokenHash: this.hashToken(refreshToken) },
      });
      return { message: 'Logged out successfully' };
    });
  }

  private async issueTokens(
    userId: string,
    email: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const refreshToken = randomBytes(48).toString('hex');
    const refreshExpiresIn = this.configService.getOrThrow<string>(
      'jwt.refreshExpiresIn',
    );
    const session = await db.refreshToken.create({
      data: {
        tokenHash: this.hashToken(refreshToken),
        userId,
        expiresAt: new Date(
          Date.now() + this.parseDurationMs(refreshExpiresIn),
        ),
      },
    });
    const payload: JwtPayload = { sub: userId, email, sid: session.id };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('jwt.accessSecret'),
      expiresIn: this.configService.getOrThrow<string>(
        'jwt.accessExpiresIn',
      ) as `${number}${'s' | 'm' | 'h' | 'd'}`,
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.configService.getOrThrow<string>('jwt.accessExpiresIn'),
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseDurationMs(duration: string): number {
    const match = /^(\d+)([smhd])$/.exec(duration);
    if (!match) {
      throw new Error('Invalid token duration');
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return 7 * 24 * 60 * 60 * 1000;
    }
  }
}
