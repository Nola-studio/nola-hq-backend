import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Country } from '../countries/country.entity';
import { AppEntity } from '../apps/app.entity';
import { Plan } from '../plans/plan.entity';
import { FeatureMatrixRow } from '../plans/feature-matrix-row.entity';

import {
  APPS_SEED,
  COUNTRIES_SEED,
  FEATURE_MATRIX_SEED,
  PLANS_SEED,
} from './seed-data';

/**
 * Au démarrage, on insère uniquement le **catalogue plateforme** : pays
 * supportés, registry des apps Nola (sans métriques opérationnelles), plans
 * tarifaires publics et matrice de features.
 *
 * Toutes les tables opérationnelles — tenants, team, activity, tickets,
 * invoices, momo, deploys, audit, logs, KPIs, pipeline, health, modules —
 * restent vides et se peuplent via l'API, l'onboarding HQ ou les
 * événements NATS.
 *
 * Le seed n'écrase rien : si une row existe déjà (même `id`), on la laisse.
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(Country) private readonly countries: Repository<Country>,
    @InjectRepository(AppEntity) private readonly apps: Repository<AppEntity>,
    @InjectRepository(Plan) private readonly plans: Repository<Plan>,
    @InjectRepository(FeatureMatrixRow)
    private readonly matrix: Repository<FeatureMatrixRow>,
  ) {}

  async onApplicationBootstrap() {
    await this.run();
  }

  async run() {
    await this.seedCountries();
    await this.seedApps();
    await this.seedPlans();
    await this.seedFeatureMatrix();
    this.logger.log(
      'Catalogue plateforme à jour (pays, apps, plans, feature matrix).',
    );
  }

  private async seedCountries() {
    for (const row of COUNTRIES_SEED) {
      const existing = await this.countries.findOne({ where: { id: row.id } });
      if (!existing) await this.countries.save(this.countries.create(row));
    }
  }

  private async seedApps() {
    for (const row of APPS_SEED) {
      const existing = await this.apps.findOne({ where: { id: row.id } });
      if (!existing) {
        await this.apps.save(
          this.apps.create({
            ...row,
            status: row.status as AppEntity['status'],
          }),
        );
      }
    }
  }

  private async seedPlans() {
    for (const row of PLANS_SEED) {
      const existing = await this.plans.findOne({ where: { id: row.id } });
      if (!existing) await this.plans.save(this.plans.create(row));
    }
  }

  private async seedFeatureMatrix() {
    const count = await this.matrix.count();
    if (count > 0) return;
    await this.matrix.save(
      FEATURE_MATRIX_SEED.map((row) => this.matrix.create(row)),
    );
  }
}
