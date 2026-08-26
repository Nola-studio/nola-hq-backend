import { mock } from 'bun:test';
mock.module('jose', () => ({
  createRemoteJWKSet: () => () => {},
  jwtVerify: async () => ({ payload: {} }),
}));
