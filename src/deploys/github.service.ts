import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CommitRange {
  /** dev branch tip. */
  headSha: string;
  /** main branch tip. */
  baseSha: string;
  /** Commits reachable from dev but not from main, oldest first. */
  commits: { sha: string; message: string; author: string; date: string }[];
  aheadBy: number;
  compareUrl: string;
}

/**
 * Read-only GitHub client for deployment ticket composition — resolving
 * "what's actually different between dev and main" via the compare API,
 * so a deployment ticket's commit range doesn't have to be typed in by
 * hand. Uses a dedicated `DEPLOYMENT_GITHUB_TOKEN`, deliberately not the
 * `GITHUB_TOKEN` already present in this app's Railway environment — that
 * one is unwired and its scope was never verified for this purpose (see
 * the Phase 1 deployment-workflow report).
 *
 * Degraded mode: unconfigured -> every call returns null + a warn, same
 * contract as KeycloakAdminService when Keycloak admin isn't set up.
 * Read-only by construction: only ever calls GitHub's GET /compare.
 */
@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);

  constructor(private readonly config: ConfigService) {}

  private token(): string | null {
    return this.config.get<string>('DEPLOYMENT_GITHUB_TOKEN') ?? null;
  }

  isConfigured(): boolean {
    return Boolean(this.token());
  }

  /** @param repo "owner/name", e.g. "Nola-studio/nola-hq-backend". */
  async commitRange(repo: string): Promise<CommitRange | null> {
    const token = this.token();
    if (!token) {
      this.logger.warn('DEPLOYMENT_GITHUB_TOKEN not configured — commit range unavailable.');
      return null;
    }
    const url = `https://api.github.com/repos/${repo}/compare/main...dev`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) {
      this.logger.warn(`GitHub compare ${repo} main...dev failed (status=${res.status})`);
      return null;
    }
    const json = (await res.json()) as {
      base_commit: { sha: string };
      commits: { sha: string; commit: { message: string; author: { name: string; date: string } } }[];
      ahead_by: number;
      html_url: string;
    };
    return {
      baseSha: json.base_commit.sha,
      headSha: json.commits.at(-1)?.sha ?? json.base_commit.sha,
      commits: json.commits.map((c) => ({
        sha: c.sha,
        message: c.commit.message.split('\n')[0],
        author: c.commit.author.name,
        date: c.commit.author.date,
      })),
      aheadBy: json.ahead_by,
      compareUrl: json.html_url,
    };
  }
}
