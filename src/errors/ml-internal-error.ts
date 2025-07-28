/**
 * MLInternalError
 * ライブラリ内部処理で発生するエラー（内部用、非公開）
 */
export class MLInternalError extends Error {
  public readonly code: string;
  public readonly fatal: boolean;

  constructor(
    message: string,
    code: string,
    fatal: boolean = true,
    error?: Error
  ) {
    super(message, { cause: error });
    this.code = code;
    this.fatal = fatal;
    this.name = "MLInternalError";
  }
}
