import {BindingScope, inject, injectable} from '@loopback/core';
import {Filter, repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {Logger} from 'pino';
import {LoggingBindings} from '../bindings/keys';
import {Session, SessionReminder} from '../models';
import {
  SessionReminderRepository,
  SessionRepository,
} from '../repositories';

export type ReminderChannel = 'email' | 'sms' | 'inapp';
export type ReminderStatus = 'pending' | 'queued' | 'sent' | 'failed' | 'cancelled';

export interface ReminderScheduleRequest {
  channel?: ReminderChannel;
  sendAt: string;
}

export interface ReminderUpdateRequest {
  status?: ReminderStatus;
  attemptCount?: number;
  lastAttemptAt?: string;
  lastError?: string;
}

@injectable({scope: BindingScope.TRANSIENT})
export class SessionReminderService {
  constructor(
    @repository(SessionReminderRepository)
    private readonly reminderRepository: SessionReminderRepository,
    @repository(SessionRepository)
    private readonly sessionRepository: SessionRepository,
    @inject(LoggingBindings.LOGGER)
    private readonly logger: Logger,
  ) { }

  async scheduleReminder(
    sessionId: string,
    request: ReminderScheduleRequest,
  ): Promise<SessionReminder> {
    const session = await this.sessionRepository.findById(sessionId);
    this.ensureReminderWindow(session, request.sendAt);

    const reminder = await this.reminderRepository.create({
      sessionId,
      channel: request.channel ?? 'email',
      sendAt: request.sendAt,
      status: 'pending',
    });

    this.logger.info({sessionId, reminderId: reminder.id}, 'reminder scheduled');
    await this.sessionRepository.updateById(sessionId, {
      reminderEnabled: true,
      reminderStatus: 'pending',
      reminderChannel: request.channel ?? 'email',
      reminderLeadMinutes: this.calculateLeadMinutes(session.sessionDate, request.sendAt),
      updatedAt: new Date().toISOString(),
    });

    return reminder;
  }

  async updateReminder(
    sessionId: string,
    reminderId: string,
    request: ReminderUpdateRequest,
  ): Promise<SessionReminder> {
    const reminder = await this.reminderRepository.findById(reminderId);
    const recordSessionId = this.normalizeId(reminder.sessionId);
    const targetSessionId = this.normalizeId(sessionId);
    if (recordSessionId !== targetSessionId) {
      throw new HttpErrors.Forbidden('Reminder does not belong to the specified session');
    }

    const updatePayload: Partial<SessionReminder> = {};
    if (request.status) {
      updatePayload.status = this.validateStatus(request.status);
    }
    if (request.attemptCount !== undefined) {
      updatePayload.attemptCount = request.attemptCount;
    }
    if (request.lastAttemptAt) {
      updatePayload.lastAttemptAt = request.lastAttemptAt;
    }
    if (request.lastError !== undefined) {
      updatePayload.lastError = request.lastError;
    }

    if (Object.keys(updatePayload).length === 0) {
      return reminder;
    }

    updatePayload.updatedAt = new Date().toISOString();
    await this.reminderRepository.updateById(reminderId, updatePayload);

    const updatedReminder = await this.reminderRepository.findById(reminderId);
    this.logger.info({sessionId, reminderId}, 'reminder updated');

    await this.sessionRepository.updateById(targetSessionId, {
      reminderStatus: updatedReminder.status,
      updatedAt: new Date().toISOString(),
    });

    return updatedReminder;
  }

  async cancelReminder(sessionId: string, reminderId: string): Promise<void> {
    const reminder = await this.reminderRepository.findById(reminderId);
    const recordSessionId = this.normalizeId(reminder.sessionId);
    const targetSessionId = this.normalizeId(sessionId);
    if (recordSessionId !== targetSessionId) {
      throw new HttpErrors.Forbidden('Reminder does not belong to the specified session');
    }

    await this.reminderRepository.deleteById(reminderId);
    this.logger.info({sessionId, reminderId}, 'reminder cancelled');

    const remaining = await this.reminderRepository.count({sessionId: recordSessionId});
    if (remaining.count === 0) {
      await this.sessionRepository.updateById(targetSessionId, {
        reminderEnabled: false,
        reminderStatus: undefined,
        reminderLeadMinutes: undefined,
        reminderChannel: undefined,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  async listReminders(
    sessionId: string,
    filter?: Filter<SessionReminder>,
  ): Promise<SessionReminder[]> {
    const baseFilter: Filter<SessionReminder> = {
      where: {sessionId},
      order: ['sendAt ASC'],
    };

    const finalFilter: Filter<SessionReminder> = {
      ...baseFilter,
      ...filter,
      where: {...baseFilter.where, ...(filter?.where ?? {})},
    };

    return this.reminderRepository.find(finalFilter);
  }

  async findDueReminders(nowIso: string): Promise<SessionReminder[]> {
    return this.reminderRepository.find({
      where: {
        status: {inq: ['pending', 'queued']},
        sendAt: {lte: nowIso},
      },
      order: ['sendAt ASC'],
    });
  }

  private ensureReminderWindow(session: Session, sendAtIso: string): void {
    const sessionDate = new Date(session.sessionDate).getTime();
    const sendAt = new Date(sendAtIso).getTime();
    if (Number.isNaN(sessionDate) || Number.isNaN(sendAt)) {
      throw new HttpErrors.BadRequest('Invalid reminder schedule timestamp');
    }
    if (sendAt > sessionDate) {
      throw new HttpErrors.BadRequest('Reminder cannot be scheduled after the session start time');
    }
  }

  private calculateLeadMinutes(sessionDateIso: string, sendAtIso: string): number | undefined {
    const sessionDate = new Date(sessionDateIso).getTime();
    const sendAt = new Date(sendAtIso).getTime();
    if (Number.isNaN(sessionDate) || Number.isNaN(sendAt)) {
      return undefined;
    }
    const diffMs = sessionDate - sendAt;
    if (diffMs < 0) {
      return undefined;
    }
    return Math.round(diffMs / 60000);
  }

  private validateStatus(status: string): ReminderStatus {
    const allowed: ReminderStatus[] = ['pending', 'queued', 'sent', 'failed', 'cancelled'];
    if (!allowed.includes(status as ReminderStatus)) {
      throw new HttpErrors.BadRequest(
        `Invalid reminder status. Allowed values: ${allowed.join(', ')}`,
      );
    }
    return status as ReminderStatus;
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
}
