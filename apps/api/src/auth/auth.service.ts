import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { AuthUserRecord, RuntimeStore } from "../common/runtime-store.ts";

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;

export interface AuthPublicUser {
  id: string;
  email: string;
  displayName: string;
  role: "member" | "admin";
}

export class AuthService {
  private readonly store: RuntimeStore;

  constructor(store: RuntimeStore) {
    this.store = store;
  }

  async register(email: string, password: string, displayName: string): Promise<{ token: string; user: AuthPublicUser }> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      throw new Error("A valid email is required");
    }
    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }
    if (!displayName.trim()) {
      throw new Error("Display name is required");
    }

    const existing = await this.store.getAuthUserByEmail(normalizedEmail);
    if (existing) {
      throw new Error("Email already registered");
    }

    const user: AuthUserRecord = {
      id: randomUUID(),
      email: normalizedEmail,
      passwordHash: this.hashPassword(password),
      displayName: displayName.trim(),
      role: "member",
      createdAt: new Date().toISOString()
    };

    await this.store.createAuthUser(user);
    const token = await this.createSession(user.id);

    return {
      token,
      user: this.toPublicUser(user)
    };
  }

  async login(email: string, password: string): Promise<{ token: string; user: AuthPublicUser }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.store.getAuthUserByEmail(normalizedEmail);
    if (!user || !this.verifyPassword(password, user.passwordHash)) {
      throw new Error("Invalid email or password");
    }

    const token = await this.createSession(user.id);
    return {
      token,
      user: this.toPublicUser(user)
    };
  }

  async logout(token: string): Promise<void> {
    await this.store.revokeAuthSession(token);
  }

  async getUserFromToken(token: string): Promise<AuthPublicUser | null> {
    if (!token) {
      return null;
    }

    const user = await this.store.getAuthUserByToken(token);
    return user ? this.toPublicUser(user) : null;
  }

  private async createSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString("hex");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

    await this.store.createAuthSession({
      id: randomUUID(),
      userId,
      token,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString()
    });

    return token;
  }

  private hashPassword(password: string): string {
    const salt = randomBytes(16).toString("hex");
    const derived = scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${derived}`;
  }

  private verifyPassword(password: string, hashed: string): boolean {
    const [salt, original] = hashed.split(":");
    if (!salt || !original) {
      return false;
    }

    const candidate = scryptSync(password, salt, 64).toString("hex");
    return timingSafeEqual(Buffer.from(original, "hex"), Buffer.from(candidate, "hex"));
  }

  private toPublicUser(user: AuthUserRecord): AuthPublicUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role ?? "member"
    };
  }
}