export interface JobsPort {
  enqueue(name: string, payload: Record<string, unknown>): Promise<void>;
}

export interface MailPort {
  send(to: string, subject: string, body: string): Promise<void>;
}
