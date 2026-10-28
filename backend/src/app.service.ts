import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'nestjs-rbac-starter',
      timestamp: new Date().toISOString(),
    };
  }
}
