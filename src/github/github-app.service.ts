import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildAppJwt, normalisePrivateKey } from './github-app-jwt';

/**
 * L'accès de Nolaa HQ à GitHub, via une GitHub App.
 *
 * Trois niveaux, et la distinction n'est pas cosmétique :
 *
 *   clé privée  →  JWT d'App        : « je suis cette App » — ne lit aucun dépôt
 *   JWT d'App   →  jeton d'install. : limité aux dépôts où l'App est installée
 *   jeton       →  appels REST      : une heure de validité, renouvelable
 *
 * L'Installation ID n'est pas en configuration : l'App le demande à GitHub
 * pour chaque dépôt. Un dépôt ajouté à l'installation devient donc accessible
 * sans redéploiement, et un dépôt retiré cesse de l'être sans qu'on ait à y
 * penser.
 */

const GITHUB_API = 'https://api.github.com';

/** On renouvelle un jeton une minute avant son terme, jamais à l'expiration. */
const TOKEN_REFRESH_MARGIN_MS = 60_000;

/** L'installation d'un dépôt ne change presque jamais ; une heure suffit. */
const INSTALLATION_CACHE_TTL_MS = 60 * 60_000;

/** Une installation de l'App, telle que GitHub la décrit. */
export interface GithubInstallation {
  id: number;
  /** L'organisation ou le compte où l'App est installée. */
  account: string;
  /** `all` ou `selected` — la source de la moitié des « pourquoi ça ne marche pas ». */
  repositorySelection: 'all' | 'selected';
}

export interface GithubAppStatus {
  status: 'connected' | 'unconfigured' | 'error';
  configured: boolean;
  appId: string | null;
  slug: string | null;
  /** Où envoyer quelqu'un pour installer l'App sur un dépôt de plus. */
  installUrl: string | null;
  /**
   * Où l'App est installée.
   *
   * Une App créée mais jamais installée n'a aucun droit, et l'erreur qu'on
   * obtient alors ne dit pas si le problème est l'absence d'installation ou
   * un mauvais périmètre. Cette liste répond aux deux sans quitter HQ.
   */
  installations: GithubInstallation[];
  error: string | null;
}

/** Ce que HQ retient d'un dépôt vu par l'API — le reste appartient à GitHub. */
export interface GithubRepositoryFacts {
  externalId: string;
  owner: string;
  name: string;
  defaultBranch: string;
  visibility: 'public' | 'private' | 'internal';
  archived: boolean;
  htmlUrl: string;
  description: string | null;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

@Injectable()
export class GithubAppService {
  private readonly logger = new Logger(GithubAppService.name);

  /** Jetons d'installation en cours de validité. Jamais journalisés. */
  private readonly tokens = new Map<number, CachedToken>();
  /** Cache des installations résolues par dépôt. Distinct de `listInstallations()`. */
  private readonly installationByRepo = new Map<string, { id: number; expiresAt: number }>();

  constructor(private readonly config: ConfigService) {}

  private read(key: string): string | undefined {
    return this.config.get<string>(key) || process.env[key];
  }

  isConfigured(): boolean {
    return Boolean(this.read('GITHUB_APP_ID') && this.read('GITHUB_APP_PRIVATE_KEY'));
  }

  /**
   * Répond sans jamais lever : un backend sans App configurée est un backend
   * dont l'intégration n'est pas encore branchée, pas un backend en panne.
   * L'écran doit pouvoir le dire calmement.
   */
  async status(): Promise<GithubAppStatus> {
    const appId = this.read('GITHUB_APP_ID') ?? null;
    const slug = this.read('GITHUB_APP_SLUG') ?? null;
    const installUrl = slug ? `https://github.com/apps/${slug}/installations/new` : null;

    if (!this.isConfigured()) {
      return {
        status: 'unconfigured',
        configured: false,
        appId,
        slug,
        installUrl,
        installations: [],
        error: 'GITHUB_APP_ID et GITHUB_APP_PRIVATE_KEY ne sont pas configurés sur ce backend.',
      };
    }

    try {
      // `GET /app` est l'appel le moins coûteux qui prouve que la clé signe
      // et que GitHub reconnaît l'App.
      const app = await this.appRequest<{ id: number; slug: string }>('/app');
      return {
        status: 'connected',
        configured: true,
        appId: String(app.id),
        slug: app.slug ?? slug,
        installUrl: `https://github.com/apps/${app.slug ?? slug}/installations/new`,
        installations: await this.listInstallations(),
        error: null,
      };
    } catch (err) {
      return {
        status: 'error',
        configured: true,
        appId,
        slug,
        installUrl,
        installations: [],
        error: err instanceof Error ? err.message : 'Erreur inconnue',
      };
    }
  }

  /**
   * Où cette App est installée.
   *
   * Créer une App et l'installer sont deux gestes distincts, et c'est le
   * piège le plus courant : une App créée mais jamais installée existe,
   * s'authentifie, et n'a accès à rien. `repository_selection` répond à la
   * question suivante — installée sur l'organisation, oui, mais sur quels
   * dépôts.
   *
   * Une liste vide n'est pas une erreur : c'est la réponse.
   */
  async listInstallations(): Promise<GithubInstallation[]> {
    const found = await this.appRequest<
      { id: number; account: { login?: string } | null; repository_selection?: string }[]
    >('/app/installations');

    return found.map((i) => ({
      id: i.id,
      account: i.account?.login ?? '(compte inconnu)',
      repositorySelection: i.repository_selection === 'all' ? 'all' : 'selected',
    }));
  }

  /** Les faits qu'on retient d'un dépôt. Lève si l'App n'y a pas accès. */
  async fetchRepository(owner: string, name: string): Promise<GithubRepositoryFacts> {
    const raw = await this.installationRequest<{
      id: number;
      name: string;
      owner: { login: string };
      default_branch: string;
      visibility?: string;
      private: boolean;
      archived: boolean;
      html_url: string;
      description: string | null;
    }>(owner, name, `/repos/${owner}/${name}`);

    return {
      externalId: String(raw.id),
      // On reprend la casse que GitHub renvoie : un dépôt renommé ou
      // re-capitalisé s'aligne sur lui, jamais l'inverse.
      owner: raw.owner.login,
      name: raw.name,
      defaultBranch: raw.default_branch,
      visibility: (raw.visibility as GithubRepositoryFacts['visibility']) ?? (raw.private ? 'private' : 'public'),
      archived: raw.archived,
      htmlUrl: raw.html_url,
      description: raw.description,
    };
  }

  /** Le commit sur lequel pointe une branche — le point de départ d'une nouvelle. */
  async branchSha(owner: string, name: string, branch: string): Promise<string> {
    const ref = await this.installationRequest<{ object: { sha: string } }>(
      owner,
      name,
      `/repos/${owner}/${name}/git/ref/heads/${encodeURIComponent(branch)}`,
    );
    return ref.object.sha;
  }

  /**
   * Crée une branche.
   *
   * GitHub répond 422 « Reference already exists » quand elle existe déjà.
   * Ce n'est pas une erreur ici : deux personnes qui démarrent le même
   * ticket, ou un double clic, doivent aboutir au même endroit. On le
   * signale plutôt que de le masquer, pour que l'appelant sache s'il a créé
   * ou retrouvé.
   */
  async createBranch(
    owner: string,
    name: string,
    branch: string,
    sha: string,
  ): Promise<{ created: boolean }> {
    try {
      await this.installationRequest(owner, name, `/repos/${owner}/${name}/git/refs`, {
        method: 'POST',
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
      });
      return { created: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('422') && /already exists/i.test(message)) {
        return { created: false };
      }
      throw err;
    }
  }

  /**
   * Tous les dépôts que cette App peut voir, toutes installations confondues.
   *
   * C'est GitHub qui sait ce à quoi il donne accès — le demander évite de
   * faire recopier des URL une par une, et évite surtout d'enregistrer un
   * dépôt sur lequel l'App n'a aucun droit, ce qui ne se découvrirait qu'au
   * premier « Start Work ».
   *
   * La pagination est suivie jusqu'au bout : une organisation de cinquante
   * dépôts ne doit pas en livrer trente.
   */
  async listInstallationRepositories(): Promise<GithubRepositoryFacts[]> {
    const found: GithubRepositoryFacts[] = [];

    for (const installation of await this.listInstallations()) {
      const token = await this.installationToken(installation.id);
      let page = 1;

      // Garde-fou : cent pages, soit dix mille dépôts. Au-delà, c'est une
      // boucle, pas une organisation.
      for (; page <= 100; page += 1) {
        const batch = await this.request<{
          repositories: {
            id: number;
            name: string;
            owner: { login: string };
            default_branch: string;
            visibility?: string;
            private: boolean;
            archived: boolean;
            html_url: string;
            description: string | null;
          }[];
        }>(`/installation/repositories?per_page=100&page=${page}`, token, {});

        if (!batch.repositories?.length) break;
        for (const raw of batch.repositories) {
          found.push({
            externalId: String(raw.id),
            owner: raw.owner.login,
            name: raw.name,
            defaultBranch: raw.default_branch,
            visibility:
              (raw.visibility as GithubRepositoryFacts['visibility']) ??
              (raw.private ? 'private' : 'public'),
            archived: raw.archived,
            htmlUrl: raw.html_url,
            description: raw.description,
          });
        }
        if (batch.repositories.length < 100) break;
      }
    }

    return found;
  }

  /** Un appel REST authentifié comme l'installation qui couvre ce dépôt. */
  async installationRequest<T>(
    owner: string,
    name: string,
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const installationId = await this.installationIdFor(owner, name);
    const token = await this.installationToken(installationId);
    return this.request<T>(path, token, init);
  }

  /**
   * L'installation qui couvre un dépôt donné.
   *
   * Mise en cache : cet appel précède chaque autre, et l'installation d'un
   * dépôt ne bouge pratiquement jamais. Un 404 n'est pas mis en cache — c'est
   * l'état qu'on veut voir changer dès que quelqu'un installe l'App.
   */
  async installationIdFor(owner: string, name: string): Promise<number> {
    const key = `${owner.toLowerCase()}/${name.toLowerCase()}`;
    const cached = this.installationByRepo.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.id;

    try {
      const found = await this.appRequest<{ id: number }>(`/repos/${owner}/${name}/installation`);
      this.installationByRepo.set(key, { id: found.id, expiresAt: Date.now() + INSTALLATION_CACHE_TTL_MS });
      return found.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('404')) {
        throw new ServiceUnavailableException(
          `L'App Nolaa HQ n'est pas installée sur ${owner}/${name} — installez-la sur ce dépôt, puis réessayez.`,
        );
      }
      throw err;
    }
  }

  /** Un jeton d'installation, renouvelé une minute avant son terme. */
  async installationToken(installationId: number): Promise<string> {
    const cached = this.tokens.get(installationId);
    if (cached && cached.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) return cached.token;

    const issued = await this.appRequest<{ token: string; expires_at: string }>(
      `/app/installations/${installationId}/access_tokens`,
      { method: 'POST' },
    );

    this.tokens.set(installationId, {
      token: issued.token,
      expiresAt: new Date(issued.expires_at).getTime(),
    });
    return issued.token;
  }

  /** Un appel signé par le JWT d'App — pour tout ce qui précède l'installation. */
  private async appRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const appId = this.read('GITHUB_APP_ID');
    const rawKey = this.read('GITHUB_APP_PRIVATE_KEY');
    if (!appId || !rawKey) {
      throw new ServiceUnavailableException('GitHub App non configurée sur ce backend.');
    }

    const { token } = buildAppJwt(appId, normalisePrivateKey(rawKey));
    return this.request<T>(path, token, init);
  }

  private async request<T>(path: string, token: string, init: RequestInit): Promise<T> {
    const base = this.read('GITHUB_API_URL') ?? GITHUB_API;
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'nolaa-hq',
        Authorization: `Bearer ${token}`,
        /**
         * Sans ce type, `fetch` déclare un corps chaîne en
         * `text/plain;charset=UTF-8`, et GitHub n'en tire aucun champ : la
         * création de branche partait alors sans `ref` ni `sha`. L'échec
         * n'était pas silencieux, mais son motif ne désignait pas sa cause.
         */
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      // Le corps d'erreur de GitHub porte le motif ; le jeton, lui, ne doit
      // apparaître dans aucun journal.
      const body = await response.text().catch(() => '');
      const detail = this.reason(body);
      this.logger.warn(`GitHub ${init.method ?? 'GET'} ${path} → ${response.status} ${detail}`);
      throw new Error(`GitHub a répondu ${response.status}${detail ? ` : ${detail}` : ''}`);
    }

    return (await response.json()) as T;
  }

  private reason(body: string): string {
    try {
      const parsed = JSON.parse(body) as { message?: string };
      return parsed.message ?? '';
    } catch {
      return body.slice(0, 200);
    }
  }
}
