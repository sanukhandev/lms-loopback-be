import {authenticate} from '@loopback/authentication';
import {authorize} from '@loopback/authorization';
import {inject} from '@loopback/core';
import {Filter, repository} from '@loopback/repository';
import {
  HttpErrors,
  Request,
  RestBindings,
  SchemaObject,
  del,
  get,
  param,
  patch,
  post,
  requestBody,
  response,
} from '@loopback/rest';
import {Logger} from 'pino';
import {LoggingBindings} from '../bindings/keys';
import {Course, Session} from '../models';
import {
  CourseRepository,
  ModuleRepository,
  SessionRepository,
  UserRepository,
} from '../repositories';
import {extractTenantId, sanitizeTenantId} from '../utils/tenant';

const SESSION_VIEW_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    id: {type: 'string'},
    courseId: {type: 'string'},
    userId: {type: 'string'},
    moduleId: {type: 'string'},
    sessionDate: {type: 'string', format: 'date-time'},
    durationMinutes: {type: 'number'},
    status: {type: 'string'},
    notes: {type: 'string'},
    sessionType: {type: 'string'},
    resourceUrl: {type: 'string'},
    attendanceRequired: {type: 'boolean'},
    attendanceCode: {type: 'string'},
    attendanceWindowMinutes: {type: 'number'},
    reminderEnabled: {type: 'boolean'},
    reminderLeadMinutes: {type: 'number'},
    reminderChannel: {type: 'string'},
    reminderStatus: {type: 'string'},
    lastReminderSentAt: {type: 'string', format: 'date-time'},
    attendeeCount: {type: 'number'},
    absenceCount: {type: 'number'},
    createdAt: {type: 'string', format: 'date-time'},
    updatedAt: {type: 'string', format: 'date-time'},
  },
};

const SESSION_CREATE_SCHEMA: SchemaObject = {
  type: 'object',
  required: ['sessionDate', 'userId'],
  properties: {
    userId: {type: 'string'},
    moduleId: {type: 'string'},
    sessionDate: {type: 'string', format: 'date-time'},
    durationMinutes: {type: 'number', minimum: 0},
    status: {
      type: 'string',
      enum: ['scheduled', 'completed', 'cancelled'],
      default: 'scheduled',
    },
    notes: {type: 'string'},
    sessionType: {
      type: 'string',
      enum: ['live', 'recorded'],
      default: 'live',
    },
    resourceUrl: {type: 'string'},
    attendanceRequired: {type: 'boolean'},
    attendanceCode: {type: 'string'},
    attendanceWindowMinutes: {type: 'number', minimum: 0},
    reminderEnabled: {type: 'boolean'},
    reminderLeadMinutes: {type: 'number', minimum: 0},
    reminderChannel: {
      type: 'string',
      enum: ['email', 'sms', 'inapp'],
    },
  },
};

const SESSION_UPDATE_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    userId: {type: 'string'},
    moduleId: {type: 'string'},
    sessionDate: {type: 'string', format: 'date-time'},
    durationMinutes: {type: 'number', minimum: 0},
    status: {
      type: 'string',
      enum: ['scheduled', 'completed', 'cancelled'],
    },
    notes: {type: 'string'},
    sessionType: {
      type: 'string',
      enum: ['live', 'recorded'],
    },
    resourceUrl: {type: 'string'},
    attendanceRequired: {type: 'boolean'},
    attendanceCode: {type: 'string'},
    attendanceWindowMinutes: {type: 'number', minimum: 0},
    reminderEnabled: {type: 'boolean'},
    reminderLeadMinutes: {type: 'number', minimum: 0},
    reminderChannel: {
      type: 'string',
      enum: ['email', 'sms', 'inapp'],
    },
  },
};

interface SessionCreateRequest {
  userId: string;
  moduleId?: string;
  sessionDate: string;
  durationMinutes?: number;
  status?: string;
  notes?: string;
  sessionType?: string;
  resourceUrl?: string;
  attendanceRequired?: boolean;
  attendanceCode?: string;
  attendanceWindowMinutes?: number;
  reminderEnabled?: boolean;
  reminderLeadMinutes?: number;
  reminderChannel?: string;
}

interface SessionUpdateRequest extends Partial<SessionCreateRequest> { }

interface SessionView {
  id?: string;
  courseId: string;
  userId: string;
  moduleId?: string;
  sessionDate: string;
  durationMinutes?: number;
  status?: string;
  notes?: string;
  sessionType?: string;
  resourceUrl?: string;
  attendanceRequired?: boolean;
  attendanceCode?: string;
  attendanceWindowMinutes?: number;
  reminderEnabled?: boolean;
  reminderLeadMinutes?: number;
  reminderChannel?: string;
  reminderStatus?: string;
  lastReminderSentAt?: string;
  attendeeCount?: number;
  absenceCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

@authenticate('jwt')
export class SessionsController {
  constructor(
    @repository(SessionRepository)
    private readonly sessionRepository: SessionRepository,
    @repository(CourseRepository)
    private readonly courseRepository: CourseRepository,
    @repository(UserRepository)
    private readonly userRepository: UserRepository,
    @repository(ModuleRepository)
    private readonly moduleRepository: ModuleRepository,
    @inject(RestBindings.Http.REQUEST)
    private readonly request: Request,
    @inject(LoggingBindings.LOGGER)
    private readonly logger: Logger,
  ) { }

  @authorize({allowedRoles: ['tenantAdmin', 'instructor']})
  @post('/tenant/courses/{courseId}/sessions')
  @response(201, {
    description: 'Schedule a session or attach recorded content to a course',
    content: {'application/json': {schema: SESSION_VIEW_SCHEMA}},
  })
  async createSession(
    @param.path.string('courseId') courseId: string,
    @requestBody({content: {'application/json': {schema: SESSION_CREATE_SCHEMA}}})
    body: SessionCreateRequest,
  ): Promise<SessionView> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    const course = await this.courseRepository.findById(courseId);
    this.ensureCourseAccess(course, tenantId);

    await this.ensureInstructorEligibility(body.userId, tenantId);
    if (body.moduleId) {
      await this.ensureModuleAlignment(body.moduleId, courseId, tenantId);
    }

    const sessionType = this.validateSessionType(body.sessionType) ?? 'live';
    const status = this.validateStatus(body.status) ?? 'scheduled';
    const attendanceWindow = this.validateNonNegativeMinutes(
      body.attendanceWindowMinutes,
      'attendanceWindowMinutes',
    );
    const reminderLead = this.validateNonNegativeMinutes(
      body.reminderLeadMinutes,
      'reminderLeadMinutes',
    );
    const reminderChannel = this.validateReminderChannel(body.reminderChannel);
    this.ensureResourceCompliance(sessionType, body.resourceUrl);

    const session = await this.sessionRepository.create({
      courseId,
      userId: body.userId,
      moduleId: body.moduleId,
      sessionDate: body.sessionDate,
      durationMinutes: body.durationMinutes,
      status,
      notes: body.notes,
      sessionType,
      resourceUrl: body.resourceUrl,
      attendanceRequired: body.attendanceRequired ?? false,
      attendanceCode: body.attendanceCode,
      attendanceWindowMinutes: attendanceWindow,
      reminderEnabled: body.reminderEnabled ?? false,
      reminderLeadMinutes: reminderLead,
      reminderChannel,
    });

    this.logger.info(
      this.buildLogContext(tenantId, {
        courseId,
        sessionId: session.id,
        sessionType: session.sessionType,
      }),
      'session created',
    );

    return this.toView(session);
  }

  @authorize({allowedRoles: ['tenantAdmin', 'instructor']})
  @get('/tenant/courses/{courseId}/sessions')
  @response(200, {
    description: 'List planner sessions for a course',
    content: {
      'application/json': {
        schema: {type: 'array', items: SESSION_VIEW_SCHEMA},
      },
    },
  })
  async listSessions(
    @param.path.string('courseId') courseId: string,
    @param.query.string('status') status?: string,
    @param.query.string('sessionType') sessionType?: string,
  ): Promise<SessionView[]> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    const course = await this.courseRepository.findById(courseId);
    this.ensureCourseAccess(course, tenantId);

    const filter: Filter<Session> = {
      where: {courseId},
      order: ['sessionDate ASC'],
    };

    if (status) {
      filter.where = {...filter.where, status};
    }

    if (sessionType) {
      filter.where = {...filter.where, sessionType};
    }

    const sessions = await this.sessionRepository.find(filter);
    const result = sessions.map(session => this.toView(session));

    this.logger.info(
      this.buildLogContext(tenantId, {
        courseId,
        statusFilter: status,
        sessionTypeFilter: sessionType,
        resultCount: result.length,
      }),
      'sessions listed',
    );

    return result;
  }

  @authorize({allowedRoles: ['tenantAdmin', 'instructor']})
  @get('/tenant/courses/{courseId}/sessions/{sessionId}')
  @response(200, {
    description: 'Retrieve a specific session',
    content: {'application/json': {schema: SESSION_VIEW_SCHEMA}},
  })
  async getSession(
    @param.path.string('courseId') courseId: string,
    @param.path.string('sessionId') sessionId: string,
  ): Promise<SessionView> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    const session = await this.sessionRepository.findById(sessionId);
    await this.ensureSessionAccess(session, courseId, tenantId);

    this.logger.debug(
      this.buildLogContext(tenantId, {
        courseId,
        sessionId,
      }),
      'session retrieved',
    );

    return this.toView(session);
  }

  @authorize({allowedRoles: ['tenantAdmin', 'instructor']})
  @patch('/tenant/courses/{courseId}/sessions/{sessionId}')
  @response(200, {
    description: 'Update a session',
    content: {'application/json': {schema: SESSION_VIEW_SCHEMA}},
  })
  async updateSession(
    @param.path.string('courseId') courseId: string,
    @param.path.string('sessionId') sessionId: string,
    @requestBody({content: {'application/json': {schema: SESSION_UPDATE_SCHEMA}}})
    body: SessionUpdateRequest,
  ): Promise<SessionView> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    const session = await this.sessionRepository.findById(sessionId);
    await this.ensureSessionAccess(session, courseId, tenantId);

    const updateData: Partial<Session> = {};

    if (body.userId) {
      await this.ensureInstructorEligibility(body.userId, tenantId);
      updateData.userId = body.userId;
    }

    if (body.moduleId !== undefined) {
      if (body.moduleId === null) {
        updateData.moduleId = undefined;
      } else {
        await this.ensureModuleAlignment(body.moduleId, courseId, tenantId);
        updateData.moduleId = body.moduleId;
      }
    }

    if (body.sessionDate) {
      updateData.sessionDate = body.sessionDate;
    }
    if (body.durationMinutes !== undefined) {
      updateData.durationMinutes = body.durationMinutes;
    }
    if (body.status) {
      updateData.status = this.validateStatus(body.status);
    }
    if (body.notes !== undefined) {
      updateData.notes = body.notes;
    }
    if (body.sessionType) {
      updateData.sessionType = this.validateSessionType(body.sessionType);
    }
    if (body.resourceUrl !== undefined) {
      updateData.resourceUrl = body.resourceUrl;
    }
    if (body.attendanceRequired !== undefined) {
      updateData.attendanceRequired = body.attendanceRequired;
    }
    if (body.attendanceCode !== undefined) {
      updateData.attendanceCode = body.attendanceCode;
    }
    if (body.attendanceWindowMinutes !== undefined) {
      updateData.attendanceWindowMinutes = this.validateNonNegativeMinutes(
        body.attendanceWindowMinutes,
        'attendanceWindowMinutes',
      );
    }
    if (body.reminderEnabled !== undefined) {
      updateData.reminderEnabled = body.reminderEnabled;
    }
    if (body.reminderLeadMinutes !== undefined) {
      updateData.reminderLeadMinutes = this.validateNonNegativeMinutes(
        body.reminderLeadMinutes,
        'reminderLeadMinutes',
      );
    }
    if (body.reminderChannel !== undefined) {
      updateData.reminderChannel = this.validateReminderChannel(
        body.reminderChannel,
      );
    }

    const nextSessionType = updateData.sessionType ?? session.sessionType ?? 'live';
    const nextResource = updateData.resourceUrl ?? session.resourceUrl;
    this.ensureResourceCompliance(nextSessionType, nextResource);

    if (Object.keys(updateData).length === 0) {
      this.logger.debug(
        this.buildLogContext(tenantId, {
          courseId,
          sessionId,
          noChanges: true,
        }),
        'session update skipped',
      );
      return this.toView(session);
    }

    updateData.updatedAt = new Date().toISOString();
    await this.sessionRepository.updateById(sessionId, updateData);

    const updated = await this.sessionRepository.findById(sessionId);
    this.logger.info(
      this.buildLogContext(tenantId, {
        courseId,
        sessionId,
        updatedFields: Object.keys(updateData),
      }),
      'session updated',
    );

    return this.toView(updated);
  }

  @authorize({allowedRoles: ['tenantAdmin', 'instructor']})
  @del('/tenant/courses/{courseId}/sessions/{sessionId}')
  @response(204, {
    description: 'Delete a session',
  })
  async deleteSession(
    @param.path.string('courseId') courseId: string,
    @param.path.string('sessionId') sessionId: string,
  ): Promise<void> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    const session = await this.sessionRepository.findById(sessionId);
    await this.ensureSessionAccess(session, courseId, tenantId);

    await this.sessionRepository.deleteById(sessionId);
    this.logger.info(
      this.buildLogContext(tenantId, {
        courseId,
        sessionId,
      }),
      'session deleted',
    );
  }

  private ensureCourseAccess(course: Course, tenantId: string): void {
    if (!course.tenantId) {
      throw new HttpErrors.BadRequest('Course record is missing tenant context');
    }

    if (sanitizeTenantId(course.tenantId) !== tenantId) {
      throw new HttpErrors.Forbidden('Course does not belong to this tenant');
    }
  }

  private async ensureSessionAccess(
    session: Session,
    courseId: string,
    tenantId: string,
  ): Promise<void> {
    const sessionCourseId = this.normalizeId(session.courseId);
    const targetCourseId = this.normalizeId(courseId);
    if (sessionCourseId !== targetCourseId) {
      throw new HttpErrors.Forbidden('Session does not belong to the specified course');
    }

    const course = await this.courseRepository.findById(sessionCourseId);
    this.ensureCourseAccess(course, tenantId);
  }

  private async ensureModuleAlignment(
    moduleId: string,
    courseId: string,
    tenantId: string,
  ): Promise<void> {
    const module = await this.moduleRepository.findById(moduleId);
    const moduleCourseId = this.normalizeId(module.courseId);
    if (moduleCourseId !== courseId) {
      throw new HttpErrors.Forbidden('Module does not belong to the specified course');
    }

    const course = await this.courseRepository.findById(moduleCourseId);
    this.ensureCourseAccess(course, tenantId);
  }

  private async ensureInstructorEligibility(
    userId: string,
    tenantId: string,
  ): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user || sanitizeTenantId(user.tenantId ?? '') !== tenantId) {
      throw new HttpErrors.Forbidden('Instructor does not belong to this tenant');
    }

    const roles = user.roles ?? [];
    if (!roles.includes('instructor') && !roles.includes('tenantAdmin')) {
      throw new HttpErrors.Forbidden('User must have instructor or tenant admin role');
    }
  }

  private validateStatus(status?: string): string | undefined {
    if (!status) {
      return undefined;
    }

    const allowed = ['scheduled', 'completed', 'cancelled'];
    if (!allowed.includes(status)) {
      throw new HttpErrors.BadRequest(
        `Invalid status value. Allowed values: ${allowed.join(', ')}`,
      );
    }

    return status;
  }

  private validateSessionType(sessionType?: string): string | undefined {
    if (!sessionType) {
      return undefined;
    }

    const allowed = ['live', 'recorded'];
    if (!allowed.includes(sessionType)) {
      throw new HttpErrors.BadRequest(
        `Invalid session type. Allowed values: ${allowed.join(', ')}`,
      );
    }

    return sessionType;
  }

  private toView(session: Session): SessionView {
    return {
      id: session.id,
      courseId: this.normalizeId(session.courseId),
      userId: session.userId,
      moduleId: session.moduleId ? this.normalizeId(session.moduleId) : undefined,
      sessionDate: session.sessionDate,
      durationMinutes: session.durationMinutes,
      status: session.status,
      notes: session.notes,
      sessionType: session.sessionType,
      resourceUrl: session.resourceUrl,
      attendanceRequired: session.attendanceRequired,
      attendanceCode: session.attendanceCode,
      attendanceWindowMinutes: session.attendanceWindowMinutes,
      reminderEnabled: session.reminderEnabled,
      reminderLeadMinutes: session.reminderLeadMinutes,
      reminderChannel: session.reminderChannel,
      reminderStatus: session.reminderStatus,
      lastReminderSentAt: session.lastReminderSentAt,
      attendeeCount: session.attendeeCount,
      absenceCount: session.absenceCount,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private ensureResourceCompliance(
    sessionType: string,
    resourceUrl?: string,
  ): void {
    if (sessionType === 'recorded' && !resourceUrl) {
      throw new HttpErrors.BadRequest(
        'Recorded sessions must include a resourceUrl',
      );
    }
  }

  private validateNonNegativeMinutes(
    minutes: number | null | undefined,
    field: string,
  ): number | undefined {
    if (minutes === null || minutes === undefined) {
      return undefined;
    }

    if (typeof minutes !== 'number' || Number.isNaN(minutes) || minutes < 0) {
      throw new HttpErrors.BadRequest(`${field} must be a non-negative number`);
    }

    return minutes;
  }

  private validateReminderChannel(channel?: string | null): string | undefined {
    if (!channel) {
      return undefined;
    }

    const allowed = ['email', 'sms', 'inapp'];
    if (!allowed.includes(channel)) {
      throw new HttpErrors.BadRequest(
        `Invalid reminder channel. Allowed values: ${allowed.join(', ')}`,
      );
    }

    return channel;
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
      correlationId: this.getCorrelationId(),
      ...extra,
    };
  }

  private getCorrelationId(): string | undefined {
    const requestId = this.request.headers['x-request-id'];
    if (Array.isArray(requestId)) {
      return requestId[0];
    }

    const correlationId = this.request.headers['x-correlation-id'];
    if (Array.isArray(correlationId)) {
      return correlationId[0];
    }

    return requestId ?? correlationId;
  }
}
