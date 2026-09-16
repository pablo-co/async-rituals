/** Typed error layers (E-2A). No route swallows an error without logging an event. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
export class SlackError extends AppError {}
export class TemplateError extends AppError {}
export class AiOutputError extends AppError {}
export class DbError extends AppError {}
