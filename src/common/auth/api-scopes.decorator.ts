import { SetMetadata } from '@nestjs/common';
import type { ApiScope } from './api-scope';

export const API_SCOPES_KEY = 'api_scopes';

/** Scopes a machine client must hold for this route. Conjunctive. */
export const ApiScopes = (...scopes: ApiScope[]) => SetMetadata(API_SCOPES_KEY, scopes);
