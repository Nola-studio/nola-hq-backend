import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Country } from './country.entity';

/**
 * Idempotent country seed for the HQ console.
 *
 * ⚠️ SOURCE OF TRUTH = kelasi-backend/libs/common/src/country-profiles/.
 *    HQ must NEVER offer to onboard a tenant in a country Kelasi
 *    doesn't support yet (the signup downstream would break on
 *    school year / level / fee scaffolding). Add a row here ONLY
 *    after the corresponding YAML exists in country-profiles/.
 *
 * Today's coverage: CD (cod.yaml) + CG (cog.yaml). When Kelasi
 * adds CI/SN/RW/MA/…, mirror it here.
 *
 * Cities + flag emoji live HQ-side because the Kelasi profile
 * doesn't carry them (it only needs schoolYear, levels, fees).
 * The list of cities is purely UX for the operator picker — drop
 * a row if a city closes or a market exits.
 */
const SEED: Array<{ id: string; name: string; flag: string; cities: string[] }> = [
  {
    id: 'CD',
    name: 'République Démocratique du Congo',
    flag: '🇨🇩',
    cities: ['Kinshasa', 'Lubumbashi', 'Goma', 'Bukavu', 'Mbuji-Mayi', 'Kananga', 'Kisangani', 'Matadi', 'Butembo'],
  },
  {
    id: 'CG',
    name: 'République du Congo',
    flag: '🇨🇬',
    cities: ['Brazzaville', 'Pointe-Noire', 'Dolisie', 'Nkayi', 'Ouesso'],
  },
];

@Injectable()
export class CountriesSeed implements OnModuleInit {
  private readonly logger = new Logger(CountriesSeed.name);

  constructor(@InjectRepository(Country) private readonly repo: Repository<Country>) {}

  async onModuleInit(): Promise<void> {
    const existing = await this.repo.find({ select: ['id'] });
    const knownIds = new Set(existing.map((r) => r.id));
    const toInsert = SEED.filter((c) => !knownIds.has(c.id));
    if (toInsert.length === 0) {
      this.logger.log(`Countries already seeded (${existing.length} rows present)`);
      return;
    }
    await this.repo.save(toInsert.map((c) => this.repo.create(c)));
    this.logger.log(`Seeded ${toInsert.length} countries: ${toInsert.map((c) => c.id).join(', ')}`);
  }
}
