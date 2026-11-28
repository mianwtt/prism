import { readFileSync, realpathSync, lstatSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { parse } from 'yaml';

const defaultRoot = fileURLToPath(new URL('./skills/', import.meta.url));
const validName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const inside = (root, path) => { const value = relative(root, path); return value && !value.startsWith('..') && !isAbsolute(value); };

export function createSkillRegistry(directory = defaultRoot) {
  const root = realpathSync(directory), catalog = [];
  const read = name => {
    if (!validName.test(name) || name.length > 64) throw new Error('非法 Skill 名称');
    const folder = join(root, name), path = join(folder, 'SKILL.md');
    if (lstatSync(folder).isSymbolicLink() || lstatSync(path).isSymbolicLink() || !inside(root, realpathSync(path))) throw new Error('Skill 路径越界');
    const raw = readFileSync(path, 'utf8');
    if (Buffer.byteLength(raw) > 24000) throw new Error('Skill 文件过大');
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
    if (!match) throw new Error('Skill 缺少 frontmatter');
    const metadata = parse(match[1]);
    if (metadata?.name !== name || typeof metadata.description !== 'string' || !metadata.description.trim() || metadata.description.length > 1024 || !match[2].trim()) throw new Error('Skill 元信息无效');
    return { name, description: metadata.description, body: match[2].trim(), sha256: createHash('sha256').update(raw).digest('hex') };
  };
  for (const entry of readdirSync(root, { withFileTypes: true })) if (entry.isDirectory()) {
    const { body, ...metadata } = read(entry.name); catalog.push(Object.freeze(metadata));
  }
  return Object.freeze({
    catalog: () => structuredClone(catalog),
    load(name) {
      const metadata = catalog.find(skill => skill.name === name);
      if (!metadata) throw new Error('Skill 未在受信目录中注册');
      const skill = read(name);
      if (skill.sha256 !== metadata.sha256) throw new Error('Skill 在本轮执行期间已变化');
      return skill;
    },
  });
}

let defaults;
export function selectSkills(role, task, registry = defaults ??= createSkillRegistry()) {
  const question = task.question || task.result?.question || task.contract?.question || '';
  const names = { coordinator: ['decision-planning'], researcher: [], reviewer: ['evidence-review'], analyst: ['decision-analysis'] }[role] || [];
  if (role === 'researcher') {
    if (/租房|房源|租金|租住|出租|rental|rent\b/i.test(question)) names.push('rental-research');
    else if (/选购|购买|商品|笔记本|电脑|手机|配置|product|laptop/i.test(question)) names.push('offer-research');
  }
  return names.map(name => registry.load(name));
}
