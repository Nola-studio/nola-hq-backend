import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { KelasiProvisionClient } from '../tenants/kelasi-provision.client';

/**
 * Thin server-side proxy to kelasi-gateway's public surface.
 *
 * Why a proxy and not a direct call from the HQ frontend: the HQ
 * frontend uses `credentials: 'include'` on every API call, which
 * requires CORS allow-list on the target. Adding `nola-hq-*` origins
 * to kelasi-gateway's CORS just for one read-only endpoint isn't
 * worth the env churn — easier to read it server-side here and
 * forward.
 *
 * Read-only endpoints only. Anything mutating goes through
 * `TenantsService.create` / `KelasiProvisionClient.provision` which
 * is shared-secret-authed.
 */
@ApiBearerAuth()
@ApiTags('kelasi-proxy')
@Controller('kelasi')
export class KelasiProxyController {
  constructor(private readonly client: KelasiProvisionClient) {}

  /**
   * Forwards to `kelasi-gateway:/api/config/countries/:code` — the
   * canonical Kelasi country profile (year shape, levels, subjects,
   * defaultFeesByCycle). The HQ Onboarding wizard uses this to
   * pre-fill the academic step.
   */
  @Get('country-profile/:code')
  @ApiOperation({ summary: 'Read a Kelasi country profile (year shape + levels)' })
  async countryProfile(@Param('code') code: string) {
    const profile = await this.client.getCountryProfile(code);
    if (!profile) throw new NotFoundException(`country_profile_not_found:${code}`);
    return profile;
  }
}
