import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  juggler,
  repository,
} from '@loopback/repository';
import {
  Session,
  SessionAttendance,
  SessionAttendanceRelations,
  User,
} from '../models';
import type {SessionRepository} from './session.repository';
import type {UserRepository} from './user.repository';

export class SessionAttendanceRepository extends DefaultCrudRepository<
  SessionAttendance,
  typeof SessionAttendance.prototype.id,
  SessionAttendanceRelations
> {
  public readonly session: BelongsToAccessor<
    Session,
    typeof SessionAttendance.prototype.id
  >;

  public readonly user: BelongsToAccessor<
    User,
    typeof SessionAttendance.prototype.id
  >;

  constructor(
    @inject('datasources.mongoTenant') dataSource: juggler.DataSource,
    @repository.getter('SessionRepository')
    protected sessionRepositoryGetter: Getter<SessionRepository>,
    @repository.getter('UserRepository')
    protected userRepositoryGetter: Getter<UserRepository>,
  ) {
    super(SessionAttendance, dataSource);

    this.session = this.createBelongsToAccessorFor(
      'session',
      this.sessionRepositoryGetter,
    );
    this.registerInclusionResolver('session', this.session.inclusionResolver);

    this.user = this.createBelongsToAccessorFor('user', this.userRepositoryGetter);
    this.registerInclusionResolver('user', this.user.inclusionResolver);
  }
}
