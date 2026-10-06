import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';

export class ReviewsService {
  constructor(private readonly container: Container) {}

  async summary(workspaceId: string, id: string) {
    const review = await this.container.reviewRepo.findById(workspaceId, id);
    if (!review) throw new NotFoundError('review');
    return { id: review.id, status: review.status };
  }
}
