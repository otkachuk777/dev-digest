export class AppError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export class NotFoundError extends AppError {
  constructor(what: string) {
    super(`${what} not found`, 404);
  }
}
