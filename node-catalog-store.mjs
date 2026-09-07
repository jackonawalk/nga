import {readFile, writeFile, rename, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';

export function createFileStore(filename = process.env.CATALOG_PATH || '.data/catalog.json') {
  const path = resolve(filename);
  return {
    async get() {
      try { return JSON.parse(await readFile(path, 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    },
    async put(_key, value) {
      await mkdir(dirname(path), {recursive: true});
      const temporary = `${path}.${process.pid}.tmp`;
      await writeFile(temporary, value);
      await rename(temporary, path);
    }
  };
}
