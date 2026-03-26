import type { IncomingMessage } from "node:http";
import { getBearerToken } from "../common/http.ts";
import { AuthService, type AuthPublicUser } from "./auth.service.ts";

type AuthResponse<T> = { success: boolean; data?: T; error?: string };

export class AuthController {
  private readonly authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
  }

  async register(body: Record<string, unknown>): Promise<AuthResponse<{ token: string; user: AuthPublicUser }>> {
    try {
      const email = typeof body.email === "string" ? body.email : "";
      const password = typeof body.password === "string" ? body.password : "";
      const displayName = typeof body.displayName === "string" ? body.displayName : "";
      const data = await this.authService.register(email, password, displayName);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async login(body: Record<string, unknown>): Promise<AuthResponse<{ token: string; user: AuthPublicUser }>> {
    try {
      const email = typeof body.email === "string" ? body.email : "";
      const password = typeof body.password === "string" ? body.password : "";
      const data = await this.authService.login(email, password);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async me(request: IncomingMessage): Promise<AuthResponse<AuthPublicUser>> {
    try {
      const token = getBearerToken(request);
      const user = await this.authService.getUserFromToken(token);
      if (!user) {
        return { success: false, error: "Unauthorized" };
      }
      return { success: true, data: user };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async logout(request: IncomingMessage): Promise<AuthResponse<{ loggedOut: true }>> {
    try {
      const token = getBearerToken(request);
      if (token) {
        await this.authService.logout(token);
      }
      return { success: true, data: { loggedOut: true } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async requireUser(request: IncomingMessage): Promise<AuthPublicUser> {
    const token = getBearerToken(request);
    const user = await this.authService.getUserFromToken(token);
    if (!user) {
      throw new Error("Unauthorized");
    }
    return user;
  }
}