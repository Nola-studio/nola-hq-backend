import type { ValueTransformer } from 'typeorm';

/** PostgreSQL bigint is returned as a string; HQ monetary values stay safe as JS numbers below 2^53. */
export const moneyTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value ?? 0,
  from: (value: string | number | null) => Number(value ?? 0),
};
