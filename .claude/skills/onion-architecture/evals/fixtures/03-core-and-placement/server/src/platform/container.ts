import type { Db } from '../db/client.js';
import { TriageRepository } from '../modules/triage/repository.js';

export class Container {
  readonly triageRepo: TriageRepository;

  constructor(readonly db: Db) {
    this.triageRepo = new TriageRepository(db);
  }
}
