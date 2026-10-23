// 通过 GitHub Git Data API 把本地相对 origin/main 的改动推成一个干净 commit。
// 背景：本机代理封了 github.com（git 协议），但 api.github.com 可达，故走 REST 绕过封锁。
//
// 设计要点：
//  - 以 API 实时查询到的远程 main 真实 tree 为权威基准（本地 origin/main 可能因 git fetch 失败而陈旧）。
//  - 安全校验：本地 origin/main 的 tree 必须与远程 tree 一致，否则中止（说明远程被意外推进）。
//  - 推送成功后自动把本地 origin/main 指向当前 HEAD（其 tree 与远程新 commit 的 tree 相同），保证后续 diff 基准正确。
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

// 本地基线（用于确定要推送哪些文件）
const localBase = git('rev-parse', 'origin/main');
const localBaseTree = git('rev-parse', 'origin/main^{tree}');
const changed = git('diff', '--name-only', 'origin/main').split('\n').filter(Boolean);

// 远程权威基准（通过 API 实时获取）
const refInfo = await api('GET', `/repos/${REPO}/git/refs/heads/main`);
const remoteMainSha = refInfo.object.sha;
const remoteCommit = await api('GET', `/repos/${REPO}/git/commits/${remoteMainSha}`);
const remoteTreeSha = remoteCommit.tree.sha;

console.log('local  origin/main :', localBase, '(tree', localBaseTree + ')');
console.log('remote main (API)  :', remoteMainSha, '(tree', remoteTreeSha + ')');
console.log('changed files (' + changed.length + '):');
for (const f of changed) console.log('  -', f);

// 安全校验：本地基线 tree 必须与远程 tree 一致，确认我们是在正确基础上叠加
if (localBaseTree !== remoteTreeSha) {
  console.log('\n[ABORT] 本地 origin/main 的 tree 与远程 main 的 tree 不一致！');
  console.log('  本地 tree:', localBaseTree, ' 远程 tree:', remoteTreeSha);
  console.log('  远程已被意外推进或本地基线陈旧，停止推送以免非快进覆盖。请先核查。');
  process.exit(2);
}

if (!DOIT) { console.log('\n[DRY-RUN] 基准一致，未更新 ref。DOIT=1 才真正推送。'); process.exit(0); }

// 为每个改动文件创建 blob（删除的文件以 sha:null 从 tree 中移除）
const entries = [];
for (const f of changed) {
  let content = null;
  try { content = readFileSync(f); } catch (e) { content = null; }
  if (content === null) {
    entries.push({ path: f, mode: '100644', type: 'blob', sha: null });   // 删除
    continue;
  }
  const b64 = content.toString('base64');
  const blob = await api('POST', `/repos/${REPO}/git/blobs`, { content: b64, encoding: 'base64' });
  entries.push({ path: f, mode: '100644', type: 'blob', sha: blob.sha });
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
