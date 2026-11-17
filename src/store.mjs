import {
  mkdir,
  writeFile,
  readFile,
  readdir,
  link,
  unlink,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
export class Store {
  constructor(directory) {
    this.directory = directory;
    this.rootWrites = new Map();
  }
  async save(space, parent = null, { id = randomUUID() } = {}) {
    if (parent) return this.withRootLock(parent.rootId || parent.id, async () => {
      await this.get(parent.id);
      return this.writeVersion(space, parent, id);
    });
    return this.writeVersion(space, parent, id);
  }
  async withRootLock(rootId, operation) {
    const prior = this.rootWrites.get(rootId) || Promise.resolve();
    let release;
    const current = new Promise(resolve => { release = resolve; });
    this.rootWrites.set(rootId, current);
    await prior;
    try { return await operation(); }
    finally { release(); if (this.rootWrites.get(rootId) === current) this.rootWrites.delete(rootId); }
  }
  async deleteRoot(id, { beforeDelete = async () => ({}) } = {}) {
    const selected = await this.get(id), rootId = selected.rootId || selected.id;
    return this.withRootLock(rootId, async () => {
      await this.get(id);
      const versions = (await this.list()).filter(s => (s.rootId || s.id) === rootId);
      const versionIds = versions.map(s => s.id);
      if(versionIds.some(key=>!/^[a-f0-9-]{36}$/.test(key)))throw new Error('空间版本标识无效');
      const related = await beforeDelete(versionIds);
      // Keep the requested version until last, so a disk failure remains retryable.
      for (const versionId of [...versionIds.filter(key => key !== id), id]) {
        try { await unlink(join(this.directory, versionId + '.json')); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      return { deletedRootId: rootId, deletedVersionIds: versionIds, ...related };
    });
  }
  async writeVersion(space, parent, id) {
    await mkdir(this.directory, { recursive: true });
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("无效的空间 ID");
    const record = {
      ...structuredClone(space),
      id,
      rootId: parent?.rootId || id,
      parentId: parent?.id || null,
      version: (parent?.version || 0) + 1,
      savedAt: new Date().toISOString(),
    };
    const temp = join(this.directory, "." + id + "." + randomUUID() + ".tmp");
    await writeFile(temp, JSON.stringify(record, null, 2), { flag: "wx" });
    try {
      await link(temp, join(this.directory, id + ".json"));
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const existing = await this.get(id);
      if (
        !space.researchJobId ||
        existing.researchJobId !== space.researchJobId
      )
        throw error;
      return existing;
    } finally {
      await unlink(temp);
    }
    return record;
  }
  async get(id) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("无效的空间 ID");
    return JSON.parse(
      await readFile(join(this.directory, id + ".json"), "utf8"),
    );
  }
  async list() {
    await mkdir(this.directory, { recursive: true });
    const names = (await readdir(this.directory)).filter((n) =>
      /^[a-f0-9-]{36}\.json$/.test(n),
    );
    const records = await Promise.all(
      names.map(async (n) => {
        try {
          return JSON.parse(await readFile(join(this.directory, n), "utf8"));
        } catch {
          return null;
        }
      }),
    );
    return records
      .filter(Boolean)
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
      .map(({ id, rootId, parentId, title, mode, version, savedAt }) => ({
        id,
        rootId,
        parentId,
        title,
        mode,
        version,
        savedAt,
      }));
  }
}
