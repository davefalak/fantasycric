export class AppService {
  health() {
    return {
      status: "ok",
      service: "fantasy-api",
      timestamp: new Date().toISOString()
    };
  }
}
