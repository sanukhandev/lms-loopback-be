import {BindingScope, inject, injectable} from '@loopback/core';
import {Filter, repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {Logger} from 'pino';
import {LoggingBindings} from '../bindings/keys';
import {Session, SessionAttendance} from '../models';
import {
  SessionAttendanceRepository,
  SessionRepository,
} from '../repositories';

export type AttendanceStatus = 'pending' | 'present' | 'absent' | 'late';

export interface AttendanceUpsertRequest {
  userId: string;
  status?: AttendanceStatus;
  joinedAt?: string;
  leftAt?: string;
  notes?: string;
  recordedBy?: string;
}

@injectable({scope: BindingScope.TRANSIENT})
export class SessionAttendanceService {
  constructor(
    @repository(SessionAttendanceRepository)
    private readonly attendanceRepository: SessionAttendanceRepository,
    @repository(SessionRepository)
    private readonly sessionRepository: SessionRepository,
    @inject(LoggingBindings.LOGGER)
    private readonly logger: Logger,
  ) { }

  async upsertAttendance(
    sessionId: string,
    request: AttendanceUpsertRequest,
  ): Promise<SessionAttendance> {
    const session = await this.sessionRepository.findById(sessionId);
    const status = this.validateStatus(request.status);

    const existing = await this.attendanceRepository.findOne({
      where: {sessionId, userId: request.userId},
    });

    let attendance: SessionAttendance;
    if (existing?.id) {
      await this.attendanceRepository.updateById(existing.id, {
        status,
        joinedAt: request.joinedAt,
        leftAt: request.leftAt,
        notes: request.notes,
        recordedBy: request.recordedBy,
        updatedAt: new Date().toISOString(),
      });
      attendance = await this.attendanceRepository.findById(existing.id);
      this.logger.info({sessionId, attendanceId: attendance.id}, 'attendance updated');
    } else {
      attendance = await this.attendanceRepository.create({
        sessionId,
        userId: request.userId,
        status: status ?? 'pending',
        joinedAt: request.joinedAt,
        leftAt: request.leftAt,
        notes: request.notes,
        recordedBy: request.recordedBy,
      });
      this.logger.info({sessionId, attendanceId: attendance.id}, 'attendance created');
    }

    await this.refreshAttendanceCounts(session);
    return attendance;
  }

  async listAttendance(
    sessionId: string,
    filter?: Filter<SessionAttendance>,
  ): Promise<SessionAttendance[]> {
    const baseFilter: Filter<SessionAttendance> = {
      where: {sessionId},
      order: ['createdAt ASC'],
    };

    const finalFilter: Filter<SessionAttendance> = {
      ...baseFilter,
      ...filter,
      where: {...baseFilter.where, ...(filter?.where ?? {})},
    };

    return this.attendanceRepository.find(finalFilter);
  }

  async deleteAttendance(sessionId: string, attendanceId: string): Promise<void> {
    const attendance = await this.attendanceRepository.findById(attendanceId);
    const recordSessionId = this.normalizeId(attendance.sessionId);
    const targetSessionId = this.normalizeId(sessionId);
    if (recordSessionId !== targetSessionId) {
      throw new HttpErrors.Forbidden('Attendance does not belong to the specified session');
    }

    await this.attendanceRepository.deleteById(attendanceId);
    this.logger.info({sessionId, attendanceId}, 'attendance deleted');

    const session = await this.sessionRepository.findById(targetSessionId);
    await this.refreshAttendanceCounts(session);
  }

  private validateStatus(status?: string): AttendanceStatus | undefined {
    if (!status) {
      return undefined;
    }

    const allowed: AttendanceStatus[] = ['pending', 'present', 'absent', 'late'];
    if (!allowed.includes(status as AttendanceStatus)) {
      throw new HttpErrors.BadRequest(
        `Invalid attendance status. Allowed values: ${allowed.join(', ')}`,
      );
    }

    return status as AttendanceStatus;
  }

  private async refreshAttendanceCounts(session: Session): Promise<void> {
    const attendees = await this.attendanceRepository.count({
      sessionId: session.id,
      status: 'present',
    });
    const absentees = await this.attendanceRepository.count({
      sessionId: session.id,
      status: 'absent',
    });

    await this.sessionRepository.updateById(session.id!, {
      attendeeCount: attendees.count,
      absenceCount: absentees.count,
      updatedAt: new Date().toISOString(),
    });
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
