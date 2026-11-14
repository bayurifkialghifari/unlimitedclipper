import path from 'node:path';
import { root } from './cargo.mjs';

export const testDataDirectory = path.resolve(
  process.env.UC_TEST_DATA_DIR ?? path.join(root, '.cache/validation-current'),
);
export const fixtureDirectory = path.resolve(
  process.env.UC_FIXTURE_DIR ?? path.join(root, '.cache/fixtures'),
);
export const modelDirectory = path.resolve(
  process.env.UC_MODELS_DIR ?? path.join(root, '.data/models'),
);
export const toolDirectory = path.resolve(
  process.env.UC_TOOLS_DIR ?? path.join(root, '.tools/windows-arm64'),
);
