import { test, expect, describe } from 'bun:test';
import 'reflect-metadata';
import { validateSync } from 'class-validator';
import { IsIn, IsString } from 'class-validator';
import { IsRecipientForChannel } from './recipient-for-channel.validator';

/**
 * Mirrors the DTO in notifications.controller.ts. Kept local to the test so
 * the validator's conditional behaviour is exercised end-to-end through
 * class-validator (the same path the global ValidationPipe runs).
 */
class Dto {
  @IsIn(['email', 'sms', 'whatsapp'])
  channel!: 'email' | 'sms' | 'whatsapp';

  @IsString()
  @IsRecipientForChannel('channel')
  to!: string;
}

function errorsFor(channel: string, to: unknown): string[] {
  const dto = new Dto();
  (dto as Record<string, unknown>).channel = channel;
  (dto as Record<string, unknown>).to = to;
  const errs = validateSync(dto);
  const toErr = errs.find((e) => e.property === 'to');
  return toErr ? Object.keys(toErr.constraints ?? {}) : [];
}

describe('IsRecipientForChannel', () => {
  test('email channel accepts a valid email', () => {
    expect(errorsFor('email', 'ops@nola.studio')).toEqual([]);
  });

  test('email channel rejects a phone number', () => {
    expect(errorsFor('email', '+243990000000').length).toBeGreaterThan(0);
  });

  test('sms channel accepts an E.164 number', () => {
    expect(errorsFor('sms', '+243990000000')).toEqual([]);
  });

  test('whatsapp channel accepts an E.164 number', () => {
    expect(errorsFor('whatsapp', '+243990000000')).toEqual([]);
  });

  test('sms channel rejects an email', () => {
    expect(errorsFor('sms', 'ops@nola.studio').length).toBeGreaterThan(0);
  });

  test('sms channel rejects a number without the leading +', () => {
    expect(errorsFor('sms', '243990000000').length).toBeGreaterThan(0);
  });

  test('sms channel rejects too-short / too-long numbers', () => {
    expect(errorsFor('sms', '+1234567').length).toBeGreaterThan(0); // 7 digits
    expect(errorsFor('sms', '+1234567890123456').length).toBeGreaterThan(0); // 16 digits
  });

  test('non-string recipient is rejected on every channel', () => {
    expect(errorsFor('email', 123).length).toBeGreaterThan(0);
    expect(errorsFor('sms', null).length).toBeGreaterThan(0);
  });
});
