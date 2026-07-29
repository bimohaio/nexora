export type DataSourceManagerErrorCode =
  | "DATASOURCE_NOT_FOUND"
  | "DATASOURCE_ALREADY_REGISTERED"
  | "DATASOURCE_REGISTRATION_FAILED"
  | "DATASOURCE_REPLACEMENT_FAILED"
  | "DATASOURCE_DEPENDENCY_MISSING"
  | "DATASOURCE_DEPENDENCY_CYCLE"
  | "DATASOURCE_MANAGER_DISPOSED"
  | "DATASOURCE_HEALTH_POLICY_INVALID";

export class DataSourceManagerError extends Error {
  public override readonly name = "DataSourceManagerError";
  public constructor(
    public readonly code: DataSourceManagerErrorCode,
    message: string,
    public readonly sourceId?: string,
    options?: ErrorOptions
  ) {
    super(message, options);
  }
}
