import type { Db } from '../db/client.js';
import type { JobsPort, MailPort } from '../vendor/shared/adapters.js';
import { ReviewsRepository } from '../modules/reviews/repository.js';
import { ExportsRepository } from '../modules/exports/repository.js';
import { NotificationsRepository } from '../modules/notifications/repository.js';

export class Container {
  readonly reviewRepo: ReviewsRepository;
  readonly exportsRepo: ExportsRepository;
  readonly notificationsRepo: NotificationsRepository;

  constructor(readonly db: Db, readonly jobs: JobsPort, private readonly mail: MailPort) {
    this.reviewRepo = new ReviewsRepository(db);
    this.exportsRepo = new ExportsRepository(db);
    this.notificationsRepo = new NotificationsRepository(db);
  }

  async mailer(): Promise<MailPort> {
    return this.mail;
  }
}
