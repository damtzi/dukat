// Main exports for @repo/eslint-config
export { baseConfig, sharedRules } from './configs/base.js';
export { webConfig } from './configs/web.js';
export { backendConfig } from './configs/backend.js';

// Default export for general use
import { baseConfig } from './configs/base.js';
export default baseConfig;
