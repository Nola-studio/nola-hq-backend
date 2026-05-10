import { Controller, Get, Header } from '@nestjs/common';
import { ManifestService } from './manifest.service';
import { Public } from '../common/auth/public.decorator';

@Controller()
export class ManifestController {
  constructor(private readonly manifest: ManifestService) {}

  @Public()
  @Get('.well-known/nola-manifest.yaml')
  @Header('Content-Type', 'application/yaml')
  raw(): string {
    return this.manifest.raw();
  }
}
