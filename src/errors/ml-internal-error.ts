import { ERROR_MESSAGES } from "./error-messages";

/**
 * MLInternalError
 * Error that occurs in library internal processing (internal use, private)
 */
export class MLInternalError extends Error {
  public readonly code: string;
  public readonly fatal: boolean;

  constructor(
    key: keyof typeof ERROR_MESSAGES,
    fatal: boolean = true,
    error?: Error,
  ) {
    const message = ERROR_MESSAGES[key];
    super(message, { cause: error });
    this.code = key;
    this.fatal = fatal;
    this.name = "MLInternalError";
  }
}
