import { MLInternalError } from "./ml-internal-error";

/**
 * MLClientError
 * Error class for application notifications
 */
export class MLClientError extends Error {
  public readonly code: string; // Code to identify the type of error

  constructor(error: MLInternalError | Error) {
    if (error instanceof MLInternalError) {
      super(error.message, { cause: error.cause });
      this.code = error.code;
    } else {
      super(error.message, { cause: error });
      this.code = "UNKNOWN_ERROR";
    }
    this.name = "MLClientError";
  }
}
