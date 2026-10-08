export interface GithubPort {
  postComment(owner: string, repo: string, number: number, body: string): Promise<{ id: string }>;
}

export interface JobsPort {
  enqueue(name: string, payload: Record<string, unknown>): Promise<void>;
}
