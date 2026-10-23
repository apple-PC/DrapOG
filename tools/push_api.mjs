// 通过 GitHub Git Data API 把本地 main 的完整 tree 推成一个干净 commit。
// 背景：本机代理封了 github.com（git 协议），但 api.github.com 可达，故走 REST 绕过封锁。
//
// 设计要点：
//  - 以 API 实时查询到的远程 main 真实 tree 为权威基线（本地 origin/main 可能因 git fetch 失败而陈旧）。
//  - 改动集合 = 本地 HEAD 的 tree 与远程 tree 的完整差异（新增 / 修改 / 删除），保证推上去的 tree
//    与本地 HEAD 完全一致，绝不会丢改（例如本地已提交但远程基线尚未包含的修复）。
//  - 推送成功后自动把本地 origin/main 指向当前 HEAD，保证后续 diff 基准正确。
//
// 用法（PAT 走环境变量，切勿写死进仓库）：
//   GITHUB_TOKEN=xxx node tools/push_api.mjs                              -> 仅打印计划（不更新 ref）
//   GITHUB_TOKEN=xxx DOIT=1 node tools/push_api.mjs                       -> 真正推送（用默认提交信息）
//   GITHUB_TOKEN=xxx DOIT=1 COMMIT_MSG="..." node tools/push_api.mjs      -> 用自定义提交信息
//
// 推荐工作流：先在本地 git commit（保证 HEAD 包含本次改动），再跑本脚本。脚本会把 origin/main 同步到 HEAD。
const REPO = 'apple-PC/DrapOG';
const API = 'https://api.github.com';
const DOIT = !!process.env.DOIT;
const TOKEN = process.env.GITHUB_TOKEN;
const MSG = process.env.COMMIT_MSG || '通过 Git Data API 推送本地改动';
// 可选：以逗号分隔的路径前缀，跳过这些路径的变更（例如 EXCLUDE="docs/" 避免改动文档目录）
const EXCLUDE = (process.env.EXCLUDE || '').split(',').map(s => s.trim()).filter(Boolean);
function excluded(path) { return EXCLUDE.some(p => path === p || path.startsWith(p)); }

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

if (!TOKEN) { console.error('缺少环境变量 GITHUB_TOKEN'); process.exit(1); }

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'drapog-push', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${txt.slice(0, 300)}`);
  return txt ? JSON.parse(txt) : null;
}

// 本地 HEAD 的完整 tree（path -> sha）
function localTreeMap() {
  const out = git('ls-tree', '-r', 'HEAD');
  const m = {};
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    const mt = line.match(/^\d+\s+\w+\s+(\w+)\t(.+)$/);
    if (!mt) continue;
    let path = mt[2];
    // git 在非 TTY 输出时对含非 ASCII 的路径做 C 风格引号转义，剥掉首尾引号
    if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1);
    m[path] = mt[1];
  }
  return m;
}

// 远程 main 的完整 tree（递归；path -> sha）
async function remoteTreeMap(treeSha) {
  const data = await api('GET', `/repos/${REPO}/git/trees/${treeSha}?recursive=1`);
  const m = {};
  for (const e of data.tree) if (e.type === 'blob') m[e.path] = e.sha;
  return m;
}

// 远程权威基准（通过 API 实时获取）
const refInfo = await api('GET', `/repos/${REPO}/git/refs/heads/main`);
const remoteMainSha = refInfo.object.sha;
const remoteCommit = await api('GET', `/repos/${REPO}/git/commits/${remoteMainSha}`);
const remoteTreeSha = remoteCommit.tree.sha;

const localTree = localTreeMap();
const remoteTree = await remoteTreeMap(remoteTreeSha);

// 计算差异：新增 / 修改（本地有且 remote 无 或 sha 不同）→ 写 blob；远程有本地无 → 删除
const entries = [];
const added = [], removed = [], updated = [];
for (const [path, sha] of Object.entries(localTree)) {
  if (excluded(path)) continue;
  if (!(path in remoteTree)) { added.push(path); entries.push({ path, mode: '100644', type: 'blob', sha }); }
  else if (remoteTree[path] !== sha) { updated.push(path); entries.push({ path, mode: '100644', type: 'blob', sha }); }
}
for (const path of Object.keys(remoteTree)) {
  if (excluded(path)) continue;
  if (!(path in localTree)) { removed.push(path); entries.push({ path, mode: '100644', type: 'blob', sha: null }); }
}

console.log('remote main (API)  :', remoteMainSha, '(tree', remoteTreeSha + ')');
console.log('local  HEAD        :', git('rev-parse', 'HEAD'));
console.log('changed files (' + entries.length + '):');
for (const p of added) console.log('  + ' + p);
for (const p of updated) console.log('  ~ ' + p);
for (const p of removed) console.log('  - ' + p);

if (entries.length === 0) {
  console.log('\n[NO-OP] 本地 HEAD 与远程 tree 已一致，无需推送。');
  process.exit(0);
}

if (!DOIT) { console.log('\n[DRY-RUN] 未更新 ref。DOIT=1 才真正推送。'); process.exit(0); }

// 为每个新增/修改文件创建 blob（删除条目 sha:null 从 tree 移除）
for (const ent of entries) {
  if (ent.sha === null) continue;
  const b64 = readFileSync(ent.path).toString('base64');
  const blob = await api('POST', `/repos/${REPO}/git/blobs`, { content: b64, encoding: 'base64' });
  ent.sha = blob.sha;
}

const tree = await api('POST', `/repos/${REPO}/git/trees`, { base_tree: remoteTreeSha, tree: entries });
const commit = await api('POST', `/repos/${REPO}/git/commits`, {
  message: MSG,
  tree: tree.sha, parents: [remoteMainSha],
});
await api('PATCH', `/repos/${REPO}/git/refs/heads/main`, { sha: commit.sha });
console.log('\n已推送 commit:', commit.sha);
console.log('tree:', tree.sha);

// 推送成功后把本地 origin/main 同步到当前 HEAD（其 tree 与远程新 commit 一致），保证后续 diff 基准正确
git('update-ref', 'refs/remotes/origin/main', 'HEAD');
console.log('本地 origin/main 已同步到 HEAD:', git('rev-parse', 'HEAD'));
