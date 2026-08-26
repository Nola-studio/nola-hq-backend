import { DynamicModule, Module, Provider, Type } from '@nestjs/common';
import { type NolaConfig, NOLA_CONFIG } from './nola.config';
import { NolaClientService } from './nola-client.service';
import { NolaAuthService } from './auth/nola-auth.service';
import { NolaCommandsService } from './commands/nola-commands.service';
import { NolaEventsService } from './events/nola-events.service';
import { NolaNotifyService } from './notify/nola-notify.service';

interface ForRootAsyncOptions {
  imports?: Type<unknown>[] | DynamicModule[];
  inject?: unknown[];
  useFactory: (...args: unknown[]) => NolaConfig | Promise<NolaConfig>;
}

const SHARED_PROVIDERS = [
  NolaClientService,
  NolaAuthService,
  NolaCommandsService,
  NolaEventsService,
  NolaNotifyService,
];

@Module({})
export class NolaSdkModule {
  static forRoot(config: NolaConfig): DynamicModule {
    return {
      module: NolaSdkModule,
      global: true,
      providers: [{ provide: NOLA_CONFIG, useValue: config }, ...SHARED_PROVIDERS],
      exports: SHARED_PROVIDERS,
    };
  }

  static forRootAsync(options: ForRootAsyncOptions): DynamicModule {
    const configProvider: Provider = {
      provide: NOLA_CONFIG,
      useFactory: options.useFactory,
      inject: options.inject as never[],
    };
    return {
      module: NolaSdkModule,
      global: true,
      imports: options.imports as DynamicModule[] | undefined,
      providers: [configProvider, ...SHARED_PROVIDERS],
      exports: SHARED_PROVIDERS,
    };
  }
}
