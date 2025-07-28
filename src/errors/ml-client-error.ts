import { MLInternalError } from "./ml-internal-error";

/**
 * MLClientError
 * アプリケーション通知用のエラー
 */
export class MLClientError extends Error {
  /** エラーの種類を識別するコード */
  public readonly code: string;

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
