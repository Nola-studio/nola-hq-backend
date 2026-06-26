import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModuleOverride } from './module-override.entity';
import { AppsService } from '../apps/apps.service';
import { UpdateModuleDto } from './dto/update-module.dto';
import { CreateModuleDto } from './dto/create-module.dto';

/**
 * Module catalogue view returned to the HQ console. Merges the manifest
 * declaration (catalogue) with the persisted override (operator edits).
 */
export interface ModuleView {
  /** Synthetic addressable id: `"<app>:<moduleId>"`. */
  id: string;
  app: string;
  /** Module identifier within the app (manifest `modules[].id`). */
  moduleId: string;
  /** Effective label (override wins over manifest name). */
  label: string;
  /** Effective "enabled by default" flag. */
  default: boolean;
  /** Effective beta flag. */
  beta: boolean;
  /** Plans the module is included in (from the manifest; [] for custom). */
  plans: string[];
  /** Whether an operator override is locking this module against the manifest. */
  manuallyEdited: boolean;
  /** `true` when a matching module exists in the app manifest. */
  manifestBacked: boolean;
  /** Source of the effective values: 'manifest' | 'override' | 'custom'. */
  source: 'manifest' | 'override' | 'custom';
}

interface ManifestModule {
  id: string;
  name?: string;
  plans?: string[];
}

@Injectable()
export class ModulesService {
  constructor(
    @InjectRepository(ModuleOverride)
    private readonly overrides: Repository<ModuleOverride>,
    private readonly apps: AppsService,
  ) {}

  /**
   * List every feature-module across all apps (or one app when `app` is
   * passed). Modules declared in app manifests are the catalogue; persisted
   * overrides win when present (manifest-backed) and custom overrides are
   * appended.
   */
  async list(filter: { app?: string } = {}): Promise<ModuleView[]> {
    const overrideRows = await this.overrides.find();
    const overrideByKey = new Map(overrideRows.map((o) => [o.id, o]));

    const views: ModuleView[] = [];
    const seen = new Set<string>();

    // 1. Manifest-declared modules from the live registry projection.
    for (const app of this.apps.listApps()) {
      if (filter.app && app.id !== filter.app) continue;
      const modules = this.manifestModules(app.manifest);
      for (const m of modules) {
        const id = `${app.id}:${m.id}`;
        seen.add(id);
        const ov = overrideByKey.get(id);
        views.push(this.merge(app.id, m, ov));
      }
    }

    // 2. Custom overrides with no manifest counterpart (or whose app isn't
    //    currently registered on the bus) — surface them so they're not lost.
    for (const ov of overrideRows) {
      if (seen.has(ov.id)) continue;
      if (filter.app && ov.app !== filter.app) continue;
      views.push(this.mergeCustom(ov));
    }

    return views.sort((a, b) => a.id.localeCompare(b.id));
  }

  async findOne(id: string): Promise<ModuleView> {
    const { app, moduleId } = this.parseId(id);
    const ov = await this.overrides.findOne({ where: { id } });
    const manifestModule = this.findManifestModule(app, moduleId);
    if (!manifestModule && !ov) {
      throw new NotFoundException(`Module "${id}" introuvable`);
    }
    return manifestModule
      ? this.merge(app, manifestModule, ov)
      : this.mergeCustom(ov!);
  }

  /**
   * Persist an override for a module. Sets `manuallyEdited = true` so the
   * override wins over the manifest from now on. `unlock: true` releases the
   * lock and deletes the override row (manifest drives the module again).
   */
  async update(id: string, dto: UpdateModuleDto): Promise<ModuleView> {
    const { app, moduleId } = this.parseId(id);
    const manifestModule = this.findManifestModule(app, moduleId);
    const existing = await this.overrides.findOne({ where: { id } });

    if (dto.unlock) {
      if (!manifestModule) {
        throw new BadRequestException({
          code: 'cannot_unlock_custom',
          message:
            'This is a custom module with no manifest backing — there is nothing to unlock to. Delete it instead.',
        });
      }
      if (existing) await this.overrides.remove(existing);
      return this.merge(app, manifestModule, undefined);
    }

    if (
      dto.label === undefined &&
      dto.default === undefined &&
      dto.beta === undefined
    ) {
      throw new BadRequestException({
        code: 'empty_patch',
        message: 'Provide at least one of label, default, beta, or unlock.',
      });
    }

    if (!manifestModule && !existing) {
      throw new NotFoundException(`Module "${id}" introuvable`);
    }

    const row =
      existing ??
      this.overrides.create({
        id,
        app,
        moduleId,
        manifestBacked: !!manifestModule,
        manuallyEdited: false,
      });

    if (dto.label !== undefined) row.label = dto.label;
    if (dto.default !== undefined) row.default = dto.default;
    if (dto.beta !== undefined) row.beta = dto.beta;
    row.manuallyEdited = true;
    row.updatedAt = new Date();

    const saved = await this.overrides.save(row);
    return manifestModule
      ? this.merge(app, manifestModule, saved)
      : this.mergeCustom(saved);
  }

  /**
   * Create a module override. For a manifest-declared module this seeds an
   * override (locked). For a brand-new identifier it creates a custom module
   * that lives only in the override layer.
   */
  async create(dto: CreateModuleDto): Promise<ModuleView> {
    const app = dto.app.trim();
    const moduleId = (dto.id ?? dto.key ?? '').trim();
    if (!moduleId) {
      throw new BadRequestException({
        code: 'module_id_required',
        message: 'Provide "id" (or "key") for the module.',
      });
    }
    const id = `${app}:${moduleId}`;
    const existing = await this.overrides.findOne({ where: { id } });
    if (existing) {
      throw new ConflictException({
        code: 'module_exists',
        message: `Module "${id}" already has an override. PATCH it instead.`,
      });
    }
    const manifestModule = this.findManifestModule(app, moduleId);

    const row = this.overrides.create({
      id,
      app,
      moduleId,
      label: dto.label,
      default: dto.default ?? false,
      beta: dto.beta ?? false,
      manuallyEdited: true,
      manifestBacked: !!manifestModule,
      updatedAt: new Date(),
    });
    const saved = await this.overrides.save(row);
    return manifestModule
      ? this.merge(app, manifestModule, saved)
      : this.mergeCustom(saved);
  }

  // ── internals ──────────────────────────────────────────────────

  private parseId(id: string): { app: string; moduleId: string } {
    const sep = id.indexOf(':');
    if (sep <= 0 || sep === id.length - 1) {
      throw new BadRequestException({
        code: 'invalid_module_id',
        message: 'Module id must be "<app>:<moduleId>".',
      });
    }
    return { app: id.slice(0, sep), moduleId: id.slice(sep + 1) };
  }

  private manifestModules(manifest: Record<string, unknown> | undefined): ManifestModule[] {
    const mods = (manifest as { modules?: unknown } | undefined)?.modules;
    if (!Array.isArray(mods)) return [];
    return mods
      .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
      .map((m) => ({
        id: String(m.id ?? ''),
        name: typeof m.name === 'string' ? m.name : undefined,
        plans: Array.isArray(m.plans) ? (m.plans as unknown[]).map(String) : [],
      }))
      .filter((m) => m.id.length > 0);
  }

  private findManifestModule(app: string, moduleId: string): ManifestModule | null {
    const projection = this.apps.listApps().find((a) => a.id === app);
    if (!projection) return null;
    return (
      this.manifestModules(projection.manifest).find((m) => m.id === moduleId) ??
      null
    );
  }

  private merge(
    app: string,
    manifest: ManifestModule,
    ov: ModuleOverride | null | undefined,
  ): ModuleView {
    const locked = !!ov?.manuallyEdited;
    return {
      id: `${app}:${manifest.id}`,
      app,
      moduleId: manifest.id,
      label: (locked && ov?.label) || manifest.name || manifest.id,
      default: locked && ov?.default != null ? ov.default : false,
      beta: locked && ov?.beta != null ? ov.beta : false,
      plans: manifest.plans ?? [],
      manuallyEdited: locked,
      manifestBacked: true,
      source: locked ? 'override' : 'manifest',
    };
  }

  private mergeCustom(ov: ModuleOverride): ModuleView {
    return {
      id: ov.id,
      app: ov.app,
      moduleId: ov.moduleId,
      label: ov.label || ov.moduleId,
      default: ov.default ?? false,
      beta: ov.beta ?? false,
      plans: [],
      manuallyEdited: ov.manuallyEdited,
      manifestBacked: ov.manifestBacked,
      source: ov.manifestBacked ? 'override' : 'custom',
    };
  }
}
