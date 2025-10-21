import {authenticate} from '@loopback/authentication';
import {authorize} from '@loopback/authorization';
import {inject, service} from '@loopback/core';
import {Filter, repository} from '@loopback/repository';
import {
  HttpErrors,
  Request,
  RestBindings,
  SchemaObject,
  del,
  get,
  param,
  post,
  requestBody,
  response,
} from '@loopback/rest';
import {Logger} from 'pino';
import {LoggingBindings} from '../bindings/keys';
import {SessionAttendance} from '../models';
import {CourseRepository, SessionRepository} from '../repositories';
import {
  AttendanceUpsertRequest,
  SessionAttendanceService,
} from '../services/session-attendance.service';
import {extractTenantId, sanitizeTenantId} from '../utils/tenant';

const ATTENDANCE_VIEW_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    id: {type: 'string'},
    sessionId: {type: 'string'},
    userId: {type: 'string'},
    status: {type: 'string'},
    joinedAt: {type: 'string', format: 'date-time'},
    leftAt: {type: 'string', format: 'date-time'},
    notes: {type: 'string'},
    recordedBy: {type: 'string'},
    createdAt: {type: 'string', format: 'date-time'},
    updatedAt: {type: 'string', format: 'date-time'},
  },
};

const ATTENDANCE_UPSERT_SCHEMA: SchemaObject = {
  type: 'object',
  required: ['userId'],
  properties: {
    userId: {type: 'string'},
    status: {
      type: 'string',
      enum: ['pending', 'present', 'absent', 'late'],
    },
    joinedAt: {type: 'string', format: 'date-time'},
    leftAt: {type: 'string', format: 'date-time'},
    notes: {type: 'string'},
    recordedBy: {type: 'string'},
  },
};

@authenticate('jwt')
export class SessionAttendanceController {
  constructor(
    @repository(CourseRepository)
    private readonly courseRepository: CourseRepository,
    @repository(SessionRepository)
    private readonly sessionRepository: SessionRepository,
    @service(SessionAttendanceService)
    private readonly attendanceService: SessionAttendanceService,
    @inject(RestBindings.Http.REQUEST)
    private readonly request: Request,
    @inject(LoggingBindings.LOGGER)
    private readonly logger: Logger,
  ) { }

  @authorize({allowedRoles: ['tenantAdmin', 'instructor']})
  @post('/tenant/sessions/{sessionId}/attendance')
  @response(201, {
    description: 'Create or update attendance for a session participant',
    content: {'application/json': {schema: ATTENDANCE_VIEW_SCHEMA}},
  })
  async upsertAttendance(
    @param.path.string('sessionId') sessionId: string,
    @requestBody({content: {'application/json': {schema: ATTENDANCE_UPSERT_SCHEMA}}})
    body: AttendanceUpsertRequest,
  ): Promise<SessionAttendance> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    await this.ensureSessionAccess(sessionId, tenantId);

    const attendance = await this.attendanceService.upsertAttendance(sessionId, body);
    this.logger.info(
      this.buildLogContext(tenantId, {sessionId, attendanceId: attendance.id}),
      'attendance upserted',
    );

    return attendance;
  }

  @authorize({allowedRoles: ['tenantAdmin', 'instructor']})
  @get('/tenant/sessions/{sessionId}/attendance')
  @response(200, {
    description: 'List attendance records for a session',
    content: {'application/json': {schema: {type: 'array', items: ATTENDANCE_VIEW_SCHEMA}}},
  })
  async listAttendance(
    @param.path.string('sessionId') sessionId: string,
    @param.query.string('status') status?: string,
  ): Promise<SessionAttendance[]> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    await this.ensureSessionAccess(sessionId, tenantId);

    const filter: Filter<SessionAttendance> = {
      where: {sessionId},
      order: ['createdAt ASC'],
    };

    if (status) {
      filter.where = {...filter.where, status};
    }

    const records = await this.attendanceService.listAttendance(sessionId, filter);
    this.logger.info(
      this.buildLogContext(tenantId, {sessionId, resultCount: records.length, statusFilter: status}),
      'attendance listed',
    );

    return records;
  }

  @authorize({allowedRoles: ['tenantAdmin', 'instructor']})
  @del('/tenant/sessions/{sessionId}/attendance/{attendanceId}')
  @response(204, {
    description: 'Delete an attendance record',
  })
  async deleteAttendance(
    @param.path.string('sessionId') sessionId: string,
    @param.path.string('attendanceId') attendanceId: string,
  ): Promise<void> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    await this.ensureSessionAccess(sessionId, tenantId);

    await this.attendanceService.deleteAttendance(sessionId, attendanceId);
    this.logger.info(
      this.buildLogContext(tenantId, {sessionId, attendanceId}),
      'attendance deleted',
    );
  }

  private async ensureSessionAccess(sessionId: string, tenantId: string): Promise<void> {
    const session = await this.sessionRepository.findById(sessionId);
    const courseId = this.normalizeId(session.courseId);
    const course = await this.courseRepository.findById(courseId);
    if (!course.tenantId) {
      throw new HttpErrors.BadRequest('Course record is missing tenant context');
    }

    if (sanitizeTenantId(course.tenantId) !== tenantId) {
      throw new HttpErrors.Forbidden('Session does not belong to this tenant');
    }
  }

  private normalizeId(id: unknown): string {
    if (typeof id === 'string') {
      return id;
    }

    if (id && typeof id === 'object' && 'toString' in id) {
      return String(id);
    }

    return String(id ?? '');
  }

  private buildLogContext(
    tenantId: string,
    extra?: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      tenantId,
      method: this.request.method,
      path: this.request.originalUrl ?? this.request.url,
      ...extra,
    };
  }
}
