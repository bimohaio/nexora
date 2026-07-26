import type { JsonValue } from "./model.js";
import { compareSchemaVersions } from "./version.js";

export interface MigrationIssue {
  readonly message: string;
  readonly context: Readonly<Record<string, JsonValue>>;
}

export interface MigrationResult {
  readonly value: unknown;
  readonly fromVersion: string;
  readonly toVersion: string;
  readonly issues: readonly MigrationIssue[];
}

export interface DocumentMigration {
  readonly fromVersion: string;
  readonly toVersion: string;
  migrate(value: unknown): MigrationResult;
}

export class MigrationRegistry {
  readonly #byFromVersion = new Map<string, DocumentMigration[]>();

  public register(migration: DocumentMigration): void {
    if (compareSchemaVersions(migration.fromVersion, migration.toVersion) !== -1)
      throw new Error("Migration target must be newer than its source.");
    const migrations = this.#byFromVersion.get(migration.fromVersion) ?? [];
    if (migrations.some(({ toVersion }) => toVersion === migration.toVersion))
      throw new Error(
        `Migration already registered: ${migration.fromVersion} -> ${migration.toVersion}`
      );
    this.#byFromVersion.set(migration.fromVersion, [...migrations, migration]);
  }

  public resolvePath(fromVersion: string, toVersion: string): readonly DocumentMigration[] {
    if (fromVersion === toVersion) return [];
    const queue: { readonly version: string; readonly path: readonly DocumentMigration[] }[] = [
      { version: fromVersion, path: [] }
    ];
    const visited = new Set([fromVersion]);
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      const candidates = [...(this.#byFromVersion.get(current.version) ?? [])].sort((a, b) =>
        a.toVersion.localeCompare(b.toVersion)
      );
      for (const migration of candidates) {
        if (migration.toVersion === toVersion) return [...current.path, migration];
        if (!visited.has(migration.toVersion)) {
          visited.add(migration.toVersion);
          queue.push({ version: migration.toVersion, path: [...current.path, migration] });
        }
      }
    }
    throw new Error(`No migration path from ${fromVersion} to ${toVersion}.`);
  }
}

export function runMigrations(
  input: unknown,
  migrations: readonly DocumentMigration[]
): MigrationResult {
  let value = input;
  const issues: MigrationIssue[] = [];
  for (const migration of migrations) {
    const result = migration.migrate(value);
    if (result.fromVersion !== migration.fromVersion || result.toVersion !== migration.toVersion)
      throw new Error("Migration returned inconsistent version metadata.");
    value = result.value;
    issues.push(...result.issues);
  }
  return {
    value,
    fromVersion: migrations[0]?.fromVersion ?? "",
    toVersion: migrations.at(-1)?.toVersion ?? "",
    issues
  };
}
