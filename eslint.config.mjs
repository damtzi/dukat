import { includeIgnoreFile } from '@eslint/compat';
import { fileURLToPath, URL } from 'node:url';
import { baseConfig } from '@dukat/eslint-config';
import { globalIgnores } from 'eslint/config';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

export default [includeIgnoreFile(gitignorePath), ...baseConfig, globalIgnores(['.agents'])];
