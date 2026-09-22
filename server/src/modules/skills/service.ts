import type { Container } from '../../platform/container.js';
import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import { SkillsRepository, type SkillRow } from './repository.js';
import { toSkillDto, toSkillVersionDto } from './helpers.js';

/**
 * Skills service. Business logic for the Skills library (rubrics, conventions,
 * security rules, custom checks) attachable to agents via `agent_skills`
 * (owned by the agents module's link endpoints, not this one).
 *
 * A skill = name + description + type + body + enabled. Body changes are
 * versioned via `skill_versions` (repository).
 */

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    const counts = await this.repo.agentCounts(workspaceId, rows.map((r) => r.id));
    return rows.map((r) => toSkillDto(r, counts.get(r.id) ?? 0));
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.byId(workspaceId, id);
    return row ? this.withCount(workspaceId, row) : undefined;
  }

  private async withCount(workspaceId: string, row: SkillRow): Promise<Skill> {
    const counts = await this.repo.agentCounts(workspaceId, [row.id]);
    return toSkillDto(row, counts.get(row.id) ?? 0);
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source: input.source ?? 'manual',
      body: input.body,
      enabled: input.enabled,
    });
    return toSkillDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? this.withCount(workspaceId, row) : undefined;
  }

  /** Delete a skill (and its versions/agent-links, via cascade). */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.delete(workspaceId, id);
  }

  /**
   * Restore an earlier body as a NEW version (history is append-only, so a
   * restore never rewrites or deletes what was there). Workspace-scoped through
   * `byId`; undefined when the skill or the version does not exist.
   */
  async restoreVersion(workspaceId: string, id: string, version: number): Promise<Skill | undefined> {
    const skill = await this.repo.byId(workspaceId, id);
    if (!skill) return undefined;
    const snapshot = (await this.repo.listVersions(id)).find((v) => v.version === version);
    if (!snapshot) return undefined;
    const row = await this.repo.update(workspaceId, id, { body: snapshot.body });
    return row ? this.withCount(workspaceId, row) : undefined;
  }

  /**
   * Body-snapshot history for a skill, newest version first. Workspace-scoped:
   * returns undefined when the skill isn't in this workspace (the route maps
   * that to 404) so version snapshots can't be read across tenants.
   */
  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.byId(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(skillId);
    return rows.map(toSkillVersionDto);
  }
}
