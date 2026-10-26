import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { HealthDao } from '../dao/health.dao';

export interface HealthStatus {
  status: 'ok';
  database: 'up';
}

@Injectable()
export class HealthService {
  constructor(private readonly healthDao: HealthDao) {}

  async check(): Promise<HealthStatus> {
    try {
      await this.healthDao.ping();
    } catch (error) {
      throw new AppException(ErrorCode.SERVICE_UNAVAILABLE, { database: 'down' }, undefined, {
        cause: error,
      });
    }
    return { status: 'ok', database: 'up' };
  }
}
