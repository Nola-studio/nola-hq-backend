"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
(0, vitest_1.describe)('@nola-studio/sdk', () => {
    (0, vitest_1.it)('should export NolaClient', async () => {
        const mod = await import('./index.js');
        (0, vitest_1.expect)(mod.NolaClient).toBeDefined();
    });
    (0, vitest_1.it)('should export AuthClient', async () => {
        const mod = await import('./index.js');
        (0, vitest_1.expect)(mod.AuthClient).toBeDefined();
    });
    (0, vitest_1.it)('should export HmacAuth', async () => {
        const mod = await import('./index.js');
        (0, vitest_1.expect)(mod.HmacAuth).toBeDefined();
    });
});
//# sourceMappingURL=index.spec.js.map