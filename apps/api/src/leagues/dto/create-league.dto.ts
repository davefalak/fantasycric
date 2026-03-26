// Data Transfer Objects for League API

import type { LeagueRecord } from "../../common/runtime-store.ts";

export class CreateLeagueDto {
  name: string;
  description?: string;
  memberLimit: number;
  totalBudget: number;
  joinDeadline: string;
  scoringPreferences?: Record<string, unknown>;

  constructor(data: Record<string, unknown>) {
    this.name = typeof data.name === "string" ? data.name : "";
    this.description = typeof data.description === "string" ? data.description : undefined;
    this.memberLimit = typeof data.memberLimit === "number" ? data.memberLimit : Number(data.memberLimit);
    this.totalBudget = typeof data.totalBudget === "number" ? data.totalBudget : Number(data.totalBudget);
    this.joinDeadline = typeof data.joinDeadline === "string" ? data.joinDeadline : "";
    this.scoringPreferences = typeof data.scoringPreferences === "object" && data.scoringPreferences !== null
      ? (data.scoringPreferences as Record<string, unknown>)
      : {};
  }

  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.name || this.name.trim().length === 0) {
      errors.push("League name is required");
    }
    if (this.name && this.name.length > 100) {
      errors.push("League name must be 100 characters or less");
    }

    if (!this.memberLimit || this.memberLimit < 2 || this.memberLimit > 100) {
      errors.push("Member limit must be between 2 and 100");
    }

    if (!this.totalBudget || this.totalBudget < 50 || this.totalBudget > 1000) {
      errors.push("Total budget must be between 50 and 1000 points");
    }

    if (!this.joinDeadline) {
      errors.push("Join deadline is required");
    } else {
      const deadline = new Date(this.joinDeadline);
      if (Number.isNaN(deadline.getTime())) {
        errors.push("Invalid join deadline format (use ISO 8601)");
      } else if (deadline <= new Date()) {
        errors.push("Join deadline must be in the future");
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

export class LeagueResponseDto {
  id: string;
  creatorId: string;
  name: string;
  description?: string;
  memberLimit: number;
  totalBudget: number;
  state: string;
  inviteCode: string;
  memberCount: number;
  joinDeadline: string;
  createdAt: string;
  scoringPreferences: Record<string, unknown>;

  constructor(data: LeagueRecord) {
    this.id = data.id;
    this.creatorId = data.creatorId;
    this.name = data.name;
    this.description = data.description;
    this.memberLimit = data.memberLimit;
    this.totalBudget = data.totalBudget;
    this.state = data.state;
    this.inviteCode = data.inviteCode;
    this.memberCount = data.memberCount || 1;
    this.joinDeadline = data.joinDeadline;
    this.createdAt = data.createdAt;
    this.scoringPreferences = data.scoringPreferences;
  }
}
