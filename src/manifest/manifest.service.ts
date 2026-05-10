import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

export interface NolaManifest {
  apiVersion: string;
  id: string;
  version: string;
  display: { name: string; tagline: string; color: string };
  auth: { realm: string; scopes: string[] };
  modules: { id: string; name: string; plans: string[] }[];
  plans: Record<
    string,
    { price_monthly_usd: number; limits: Record<string, number | null> }
  >;
  admin_actions: { id: string; label: string; dangerous?: boolean }[];
  events: { emits: string[]; consumes: string[] };
  notification_templates: { id: string; channels: string[] }[];
}

@Injectable()
export class ManifestService {
  private readonly logger = new Logger(ManifestService.name);
  private readonly manifest: NolaManifest;
  private readonly rawYaml: string;

  constructor() {
    const path =
      process.env.NOLA_MANIFEST_PATH ?? join(process.cwd(), 'nola.yaml');
    this.rawYaml = readFileSync(path, 'utf8');
    this.manifest = parseYaml(this.rawYaml) as NolaManifest;
    this.logger.log(
      `Manifest loaded: ${this.manifest.id} v${this.manifest.version}`,
    );
  }

  get(): NolaManifest {
    return this.manifest;
  }

  raw(): string {
    return this.rawYaml;
  }
}
