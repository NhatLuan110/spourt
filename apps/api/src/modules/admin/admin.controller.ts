import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { adminRoleSchema, adminUserQuerySchema } from '@sprout/shared';
import type { AdminRoleInput, AdminUserQuery } from '@sprout/shared';
import { zodPipe } from '@app/common/pipes/zod-validation.pipe';
import { CurrentUser, Roles } from '@app/common/decorators/auth.decorators';
import { AdminService } from './admin.service';

const idParam = z.object({ id: z.string().min(1) });

/**
 * Every route here requires the ADMIN role. `RolesGuard` is registered globally
 * in AppModule, so the class-level decorator is what enforces it.
 */
@ApiTags('admin')
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Users, content, activity and AI usage at a glance' })
  overview() {
    return this.admin.overview();
  }

  @Get('users')
  @ApiOperation({ summary: 'Learner list with search, role filter and paging' })
  async users(@Query(zodPipe(adminUserQuerySchema)) query: AdminUserQuery) {
    const { rows, meta } = await this.admin.users(query);
    return { data: rows, meta };
  }

  @Get('content-issues')
  @ApiOperation({ summary: 'Content problems visible only in the database' })
  contentIssues() {
    return this.admin.contentIssues();
  }

  @Patch('users/:id/role')
  @ApiOperation({ summary: 'Change a learner’s role; the last admin cannot be demoted' })
  setRole(
    @CurrentUser('id') actorId: string,
    @Param(zodPipe(idParam)) params: { id: string },
    @Body(zodPipe(adminRoleSchema)) body: AdminRoleInput,
  ) {
    return this.admin.setRole(actorId, params.id, body);
  }
}
