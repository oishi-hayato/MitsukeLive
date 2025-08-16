import { ERROR_MESSAGES } from "./error-messages";

/**
 * MLInternalError
 * ライブラリ内部処理で発生するエラー（内部用、非公開）
 */
export class MLInternalError extends Error {
  public readonly code: string;
  public readonly fatal: boolean;

  constructor(
    key: keyof typeof ERROR_MESSAGES,
    fatal: boolean = true,
    error?: Error
  ) {
    const message = ERROR_MESSAGES[key];
    super(message, { cause: error });
    this.code = key;
    this.fatal = fatal;
    this.name = "MLInternalError";
  }
}
