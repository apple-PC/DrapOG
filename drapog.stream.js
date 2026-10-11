/**
 * @file        drapog.stream.js
 * @module      drapog/stream
 * @summary     流式输出工具：把 VM 的全量 onOutput 增量收敛为逐行推送，并负责最后的残行 flush
 * @version     0.1.0
 */

/**
 * 构造一个行写入器。
 *
 * VM 的 onOutput 每次回调都传入**完整的 vm.out**（全量），由本工具用 consumed 游标
 * 抽取增量，按 '\n' 切分并逐行交给 pushLine；未以 '\n' 结尾的残行暂存，直到 flush()
 * 或下一次遇到换行。这统一了此前 cmd.js / apps.js / shell.js 三处各自为政的 lastLen/pending 逻辑。
 *
 * @param {(line: string) => void} pushLine  单行输出回调（不含换行符）
 * @returns {{ feed: (fullOut: string) => void, flush: () => void }}
 */
export function makeLineWriter(pushLine) {
  let consumed = 0;   // 已处理的 vm.out 字符数
  let buf = '';       // 尚未遇到 '\n' 的残行

  function feed(fullOut) {
    const full = String(fullOut);
    if (full.length < consumed) { consumed = 0; }   // 防御：vm.out 被重置
    const fresh = full.slice(consumed);
    consumed = full.length;
    if (!fresh) return;
    buf += fresh;
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      pushLine(buf.slice(0, idx));
      buf = buf.slice(idx + 1);
    }
  }

  function flush() {
    if (buf.length > 0) { pushLine(buf); buf = ''; }
  }

  return { feed, flush };
}
