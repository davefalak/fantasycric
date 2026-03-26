import { AppService } from "./app.service.ts";

export class AppController {
  private readonly appService: AppService;

  constructor(appService: AppService) {
    this.appService = appService;
  }

  health() {
    return this.appService.health();
  }
}
