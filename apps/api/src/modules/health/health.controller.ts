import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { Public } from '@app/common/decorators/auth.decorators';
import { RawResponse } from '@app/common/interceptors/envelope.interceptor';
import { PrismaService } from '@app/infra/prisma/prisma.service';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: the process is up. */
  @Public()
  @Get('healthz')
  @RawResponse()
  health(@Res() reply: FastifyReply) {
    void reply.status(HttpStatus.OK).send({ status: 'ok', uptime: Math.round(process.uptime()) });
  }

  /** Readiness: dependencies answer, so traffic can be routed here. */
  @Public()
  @Get('readyz')
  @RawResponse()
  async ready(@Res() reply: FastifyReply) {
    const database = await this.prisma.ping();
    void reply
      .status(database ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
      .send({ status: database ? 'ready' : 'degraded', checks: { database } });
  }
}
