import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NolaConfig } from '@nola-hq/nola-sdk';
import { ManifestService } from '../manifest/manifest.service';

@Injectable()
export class HqConfigService {
  constructor(
    private readonly config: ConfigService,
    private readonly manifest: ManifestService,
  ) {}

  /** Construit la config du SDK Nola (NATS + bootstrap Keycloak). */
  nola(): NolaConfig {
    const manifest = this.manifest.get();
    const offline =
      this.config.get<string>('NOLA_OFFLINE') === 'true' ||
      // En l'absence d'un NATS_URL valide, on reste offline pour ne pas
      // bloquer le boot Railway sur un announce qui n'aboutira jamais.
      !this.config.get<string>('NATS_URL');

    return {
      serviceName: manifest.id,
      serviceVersion: manifest.version,
      natsUrl:
        this.config.get<string>('NATS_URL') ?? 'nats://localhost:4222',
      natsUser: this.config.get<string>('NATS_USER') || undefined,
      natsPass: this.config.get<string>('NATS_PASS') || undefined,
      authIssuer:
        this.config.get<string>('NOLA_AUTH_ISSUER') || undefined,
      authAudience: manifest.id,
      authSessionEndpoint:
        this.config.get<string>('NOLA_AUTH_SESSION_ENDPOINT') ??
        '/v1/sessions',
      offline,
      bootstrap: this.buildBootstrap(manifest),
    };
  }

  private buildBootstrap(
    manifest: ReturnType<ManifestService['get']>,
  ): NolaConfig['bootstrap'] {
    const user = this.config.get<string>('NOLA_BOOTSTRAP_USER');
    const pass = this.config.get<string>('NOLA_BOOTSTRAP_PASS');
    const secret = this.config.get<string>('NOLA_BOOTSTRAP_SECRET');
    if (!user || !pass || !secret) return undefined;
    return {
      bootstrapUser: user,
      bootstrapPass: pass,
      bootstrapSecret: secret,
      realm: manifest.auth.realm,
      displayName: manifest.display.name,
      consumes: manifest.events?.consumes ?? [],
      emits: manifest.events?.emits ?? [],
      manifest: manifest as unknown as Record<string, unknown>,
    };
  }
}
