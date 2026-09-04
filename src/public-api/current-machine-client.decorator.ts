import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { MachineClient } from '../common/auth/machine-client.guard';

/** Le client machine vérifié, posé sur la requête par `MachineClientGuard`. */
export const CurrentMachineClient = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): MachineClient => {
    const req = ctx.switchToHttp().getRequest<{ machineClient?: MachineClient }>();
    // Le guard s'exécute avant : s'il n'y a rien ici, c'est que la route a été
    // déclarée sans lui, ce qui est un bug de câblage, pas un cas d'exécution.
    if (!req.machineClient) throw new Error('MachineClientGuard absent de cette route');
    return req.machineClient;
  },
);
