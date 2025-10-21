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
  patch,
  post,
  requestBody,
  response,
} from '@loopback/rest';
import {Logger} from 'pino';
import {LoggingBindings} from '../bindings/keys';
import {SessionReminder} from '../models';
import {CourseRepository, SessionRepository} from '../repositories';
import {
  ReminderScheduleRequest,
  ReminderUpdateRequest,
  SessionReminderService,
} from '../services/session-reminder.service';
import {extractTenantId, sanitizeTenantId} from '../utils/tenant';

const REMINDER_VIEW_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    id: {type: 'string'},
    sessionId: {type: 'string'},
    channel: {type: 'string'},
    sendAt: {type: 'string', format: 'date-time'},
    status: {type: 'string'},
    attemptCount: {type: 'number'},
    lastAttemptAt: {type: 'string', format: 'date-time'},
    lastError: {type: 'string'},
    createdAt: {type: 'string', format: 'date-time'},
    updatedAt: {type: 'string', format: 'date-time'},
  },
};

const REMINDER_SCHEDULE_SCHEMA: SchemaObject = {
  type: 'object',
  required: ['sendAt'],
  properties: {
    channel: {
      type: 'string',
      enum: ['email', 'sms', 'inapp'],
      default: 'email',
    },
    sendAt: {type: 'string', format: 'date-time'},
  },
};

const REMINDER_UPDATE_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: ['pending', 'queued', 'sent', 'failed', 'cancelled'],
    },
    attemptCount: {type: 'number', minimum: 0},
    lastAttemptAt: {type: 'string', format: 'date-time'},
    lastError: {type: 'string'},
  },
};

@authenticate('jwt')
export class SessionRemindersController {
  constructor(
    @repository(CourseRepository)
    private readonly courseRepository: CourseRepository,
    @repository(SessionRepository)
    private readonly sessionRepository: SessionRepository,
    @service(SessionReminderService)
    private readonly reminderService: SessionReminderService,
    @inject(RestBindings.Http.REQUEST)
    private readonly request: Request,
    @inject(LoggingBindings.LOGGER)
    private readonly logger: Logger,
  ) { }

  @authorize({allowedRoles: ['tenantAdmin', 'instructor']})
  @post('/tenant/sessions/{sessionId}/reminders')
  @response(201, {
    description: 'Schedule a reminder for a session',
    content: {'application/json': {schema: REMINDER_VIEW_SCHEMA}},
  })
  async scheduleReminder(
    @param.path.string('sessionId') sessionId: string,
    @requestBody({content: {'application/json': {schema: REMINDER_SCHEDULE_SCHEMA}}})
    body: ReminderScheduleRequest,
  ): Promise<SessionReminder> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    await this.ensureSessionAccess(sessionId, tenantId);

    const reminder = await this.reminderService.scheduleReminder(sessionId, body);
    this.logger.info(
      this.buildLogContext(tenantId, {sessionId, reminderId: reminder.id}),
      'reminder scheduled',
    );

    return reminder;
  }

  @authorize({allowedRoles: ['tenantAdmin', 'instructor']})
  @get('/tenant/sessions/{sessionId}/reminders')
  @response(200, {
    description: 'List reminders for a session',
    content: {'application/json': {schema: {type: 'array', items: REMINDER_VIEW_SCHEMA}}},
  })
  async listReminders(
    @param.path.string('sessionId') sessionId: string,
    @param.query.string('status') status?: string,
  ): Promise<SessionReminder[]> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    await this.ensureSessionAccess(sessionId, tenantId);

    const filter: Filter<SessionReminder> = {
      where: {sessionId},
      order: ['sendAt ASC'],
    };

    if (status) {
      filter.where = {...filter.where, status};
    }

    const reminders = await this.reminderService.listReminders(sessionId, filter);
    this.logger.info(
      this.buildLogContext(tenantId, {sessionId, resultCount: reminders.length, statusFilter: status}),
      'reminders listed',
    );

    return reminders;
  }

  @authorize({allowedRoles: ['tenantAdmin', 'instructor']})
  @patch('/tenant/sessions/{sessionId}/reminders/{reminderId}')
  @response(200, {
    description: 'Update a scheduled reminder',
    content: {'application/json': {schema: REMINDER_VIEW_SCHEMA}},
  })
  async updateReminder(
    @param.path.string('sessionId') sessionId: string,
    @param.path.string('reminderId') reminderId: string,
    @requestBody({content: {'application/json': {schema: REMINDER_UPDATE_SCHEMA}}})
    body: ReminderUpdateRequest,
  ): Promise<SessionReminder> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    await this.ensureSessionAccess(sessionId, tenantId);

    const updated = await this.reminderService.updateReminder(sessionId, reminderId, body);
    this.logger.info(
      this.buildLogContext(tenantId, {sessionId, reminderId, status: updated.status}),
      'reminder updated',
    );

    return updated;
  }

  @authorize({allowedRoles: ['tenantAdmin', 'instructor']})
  @del('/tenant/sessions/{sessionId}/reminders/{reminderId}')
  @response(204, {
    description: 'Cancel a scheduled reminder',
  })
  async cancelReminder(
    @param.path.string('sessionId') sessionId: string,
    @param.path.string('reminderId') reminderId: string,
  ): Promise<void> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    await this.ensureSessionAccess(sessionId, tenantId);

    await this.reminderService.cancelReminder(sessionId, reminderId);
    this.logger.info(
      this.buildLogContext(tenantId, {sessionId, reminderId}),
      'reminder cancelled',
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
