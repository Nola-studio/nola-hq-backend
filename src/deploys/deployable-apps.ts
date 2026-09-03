/**
 * Static app id -> GitHub repo map for deployment ticket composition
 * (`GithubService.commitRange`). Deliberately static, not discovered: the
 * `apps` registry (`apps.service.ts`) only knows about live, self-reporting
 * NATS instances — it has no concept of "this app's code lives in this
 * GitHub repo," and inventing that discovery mechanism for two entries
 * isn't worth it. Grows by adding a line, not by building a mapping layer.
 */
export const DEPLOYABLE_APPS: Record<string, string> = {
  'nola-hq-backend': 'Nola-studio/nola-hq-backend',
  'nola-hq': 'Nola-studio/nola-hq',
};
