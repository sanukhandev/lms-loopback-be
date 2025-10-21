import {BindingScope, injectable, Provider} from '@loopback/core';
import pino, {Logger, LoggerOptions, stdTimeFunctions} from 'pino';

@injectable({scope: BindingScope.SINGLETON})
export class LoggerProvider implements Provider<Logger> {
  value(): Logger {
    const level = process.env.LOG_LEVEL ?? 'info';
    const options: LoggerOptions = {
      level,
      base: {
        environment: process.env.NODE_ENV ?? 'development',
      },
      timestamp: stdTimeFunctions.isoTime,
    };

    return pino(options);
  }
}
