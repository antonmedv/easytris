import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Plugin } from "vite";

export type ServiceWorkerOptions = {
  /** The worker's source, relative to the project root. */
  readonly source: string;
  /** Where to emit it, relative to the output directory. */
  readonly fileName?: string;
  /**
   * Built files to leave out of the precache, relative to the output directory.
   *
   * `index.html` is excluded by default because the worker caches the scope root
   * instead: that is the URL `start_url` asks for and the one navigations are
   * answered with, so caching both would store the same page twice.
   */
  readonly exclude?: readonly string[];
};

const DEFAULT_EXCLUDE = ["index.html", "sw.js", ".DS_Store"];

/** Relative URLs, resolved by the worker against its own location. */
const SHELL = "./";

async function listFiles(dir: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const name = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await listFiles(path.join(dir, entry.name), name)));
    else if (entry.isFile()) files.push(name);
  }
  return files.sort();
}

/**
 * Identifies this build by what it contains. Vite's asset names already carry a
 * content hash, but the files copied out of public/ do not, so a changed icon
 * would otherwise leave the cache name -- and with it every cached response --
 * untouched. Hashing the bytes means any change at all installs a fresh cache.
 */
async function versionOf(outDir: string, files: readonly string[]): Promise<string> {
  const digest = createHash("sha256");
  for (const file of files) {
    // Separated, so no rename can rearrange the same bytes into the same hash.
    digest.update(`${file}\0`);
    digest.update(await readFile(path.join(outDir, ...file.split("/"))));
    digest.update("\0");
  }
  return digest.digest("hex").slice(0, 12);
}

/**
 * Emits the service worker with the list of files to precache prepended to it.
 *
 * It runs in closeBundle rather than generateBundle because the precache has to
 * cover public/, and Vite copies that directory while writing the bundle: any
 * earlier and the icons and the manifest would not be on disk yet to be hashed.
 */
export function serviceWorker(options: ServiceWorkerOptions): Plugin {
  const fileName = options.fileName ?? "sw.js";
  const exclude = new Set([...DEFAULT_EXCLUDE, ...(options.exclude ?? [])]);
  let root = process.cwd();
  let outDir = "dist";

  return {
    name: "easytris:service-worker",
    apply: "build",

    configResolved(config) {
      root = config.root;
      outDir = path.resolve(config.root, config.build.outDir);
    },

    async closeBundle() {
      const found = await listFiles(outDir);
      const files = found.filter((file) => !exclude.has(file));
      const version = await versionOf(outDir, files);
      const manifest = {
        version,
        files: [SHELL, ...files.map((file) => `${SHELL}${file}`)],
      };
      const source = await readFile(path.resolve(root, options.source), "utf8");
      const preamble = `self.PRECACHE_MANIFEST = ${JSON.stringify(manifest)};\n`;
      await writeFile(path.join(outDir, fileName), preamble + source);
      this.info(`${fileName}: ${manifest.files.length} files precached as ${version}`);
    },
  };
}
