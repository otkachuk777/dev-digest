export interface GithubPort {
  getPull(owner: string, repo: string, number: number): Promise<{ title: string; state: string; headSha: string }>;
  listChangedFiles(owner: string, repo: string, number: number): Promise<string[]>;
}

export interface SecretsPort {
  get(name: string): string | undefined;
}
