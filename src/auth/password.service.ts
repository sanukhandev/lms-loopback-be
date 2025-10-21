import {BindingScope, inject, injectable} from '@loopback/core';
import {compare, genSalt, hash} from 'bcryptjs';
import {AuthBindings} from '../bindings/keys';
import {PasswordHasher} from './types';

@injectable({scope: BindingScope.SINGLETON})
export class BcryptHasher implements PasswordHasher {
  constructor(
    @inject(AuthBindings.BCRYPT_ROUNDS) private readonly rounds: number,
  ) { }

  async hashPassword(plain: string): Promise<string> {
    if (!plain) {
      throw new Error('Password cannot be empty');
    }

    const salt = await genSalt(this.rounds);
    return hash(plain, salt);
  }

  async comparePassword(plain: string, hashed: string): Promise<boolean> {
    if (!plain || !hashed) {
      return false;
    }

    return compare(plain, hashed);
  }
}
