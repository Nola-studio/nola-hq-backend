import {
  registerDecorator,
  isEmail,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/** E.164 MSISDN: a leading `+` followed by 8–15 digits. */
const E164 = /^\+\d{8,15}$/;

/**
 * Validates the `to` recipient against the sibling `channel`:
 *   - `channel === 'email'`           → `to` must be a valid email.
 *   - `channel === 'sms' | 'whatsapp'` → `to` must be an E.164 phone number.
 *
 * Implemented as a single custom decorator rather than two `@ValidateIf`s
 * because class-validator AND-s every `@ValidateIf` condition on a property
 * and gates ALL its validators on the result — two mutually exclusive
 * conditions would disable validation entirely.
 */
export function IsRecipientForChannel(
  channelProperty = 'channel',
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isRecipientForChannel',
      target: object.constructor,
      propertyName,
      constraints: [channelProperty],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [channelProp] = args.constraints as [string];
          const channel = (args.object as Record<string, unknown>)[channelProp];
          if (typeof value !== 'string') return false;
          if (channel === 'email') return isEmail(value);
          if (channel === 'sms' || channel === 'whatsapp') return E164.test(value);
          // Unknown channel — let the @IsIn on `channel` produce the error;
          // don't double-report here.
          return false;
        },
        defaultMessage(args: ValidationArguments) {
          const [channelProp] = args.constraints as [string];
          const channel = (args.object as Record<string, unknown>)[channelProp];
          if (channel === 'email') {
            return 'to must be a valid email address when channel is "email"';
          }
          return 'to must be an E.164 phone number (e.g. +243990000000) when channel is "sms" or "whatsapp"';
        },
      },
    });
  };
}
