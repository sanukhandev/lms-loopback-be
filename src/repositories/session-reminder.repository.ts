import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  juggler,
  repository,
} from '@loopback/repository';
import {Session, SessionReminder, SessionReminderRelations} from '../models';
import type {SessionRepository} from './session.repository';

export class SessionReminderRepository extends DefaultCrudRepository<
  SessionReminder,
  typeof SessionReminder.prototype.id,
  SessionReminderRelations
> {
  public readonly session: BelongsToAccessor<
    Session,
    typeof SessionReminder.prototype.id
  >;

  constructor(
    @inject('datasources.mongoTenant') dataSource: juggler.DataSource,
    @repository.getter('SessionRepository')
    protected sessionRepositoryGetter: Getter<SessionRepository>,
  ) {
    super(SessionReminder, dataSource);

    this.session = this.createBelongsToAccessorFor(
      'session',
      this.sessionRepositoryGetter,
    );
    this.registerInclusionResolver('session', this.session.inclusionResolver);
  }
}
