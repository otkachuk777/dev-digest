import type { Db } from '../db/client.js';
import { FindingsRepository } from '../modules/findings/repository.js';
import { PullsRepository } from '../modules/pulls/repository.js';

export class Container {
  readonly findingsRepo: FindingsRepository;
  readonly pullsRepo: PullsRepository;

  constructor(readonly db: Db) {
    this.findingsRepo = new FindingsRepository(db);
    this.pullsRepo = new PullsRepository(db);
  }
}
