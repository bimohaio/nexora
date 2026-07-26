export interface Clock {
  now(): string;
}

export class SystemClock implements Clock {
  public now(): string {
    return new Date().toISOString();
  }
}

export class FixedClock implements Clock {
  public constructor(private readonly value: string) {}

  public now(): string {
    return this.value;
  }
}
