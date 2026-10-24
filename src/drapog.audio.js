/**
 * @file        src/drapog.audio.js
 * @module      drapog/audio
 * @summary     宿主音频引擎（媒体类 DrapLang 应用：音波可视化 / 计时器提示音）
 * @version     1.0.0
 * @description DrapLang 侧只有 win_audio* 这组系统调用，真正的 Web Audio 能力收敛在这里：
 *                - open()   选文件 → <audio> + MediaElementSource → AnalyserNode
 *                - micOn()  麦克风 → MediaStreamSource → AnalyserNode
 *                - band()   频谱分量（0..100），供可视化取用
 *                - beep()   振荡器提示音（计时结束 / 节拍）
 *              Node（无 DOM）环境下所有方法安全退化，方便 headless 测试与 CLI 模式。
 */

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

export function createAudioEngine() {
  let ctx = null;          // AudioContext
  let analyser = null;     // 频谱分析节点
  let data = null;         // Uint8Array 频域缓冲
  let el = null;           // <audio> 元素（文件模式）
  let srcNode = null;      // MediaElementAudioSourceNode / MediaStreamAudioSourceNode
  let micStream = null;    // 麦克风流（用于关闭）
  let name = '';           // 当前音源名称
  let mode = 'none';       // none | file | mic

  function ensureCtx() {
    if (!isBrowser) return null;
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.75;
    data = new Uint8Array(analyser.frequencyBinCount);
    // 分析支路：analyser → 静音 sink → destination。
    // 这样频谱节点始终被音频图「拉动」（否则某些浏览器不给数据），
    // 又不会把麦克风回放到扬声器造成啸叫。
    const sink = ctx.createGain();
    sink.gain.value = 0;
    analyser.connect(sink);
    sink.connect(ctx.destination);
    return ctx;
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
  }

  // 断开并释放当前音源（切源前调用）
  function detach() {
    try { if (srcNode) srcNode.disconnect(); } catch (e) {}
    srcNode = null;
    if (micStream) {
      try { micStream.getTracks().forEach(t => t.stop()); } catch (e) {}
      micStream = null;
    }
    if (el) { try { el.pause(); el.src = ''; } catch (e) {} }
  }

  function pickFile() {
    return new Promise(resolve => {
      if (!isBrowser) return resolve(null);
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*,video/*';
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      let done = false;
      const finish = (f) => { if (done) return; done = true; try { input.remove(); } catch (e) {} resolve(f); };
      input.addEventListener('change', () => finish(input.files && input.files[0] ? input.files[0] : null));
      // 用户取消时 change 不触发：回到窗口后若仍未选中任何文件则视为取消（已选则 change 早就 resolve）
      window.addEventListener('focus', () => setTimeout(() => {
        if (!input.files || input.files.length === 0) finish(null);
      }, 2500), { once: true });
      document.body.appendChild(input);
      input.click();
    });
  }

  return {
    get mode() { return mode; },
    get name() { return name; },

    // 选择并加载音视频文件：返回文件名（取消返回空串）
    async open() {
      if (!isBrowser) return '';
      const file = await pickFile();
      if (!file) return '';
      const c = ensureCtx();
      detach();
      el = new Audio(URL.createObjectURL(file));
      el.crossOrigin = 'anonymous';
      el.loop = false;
      if (c) {
        try {
          srcNode = c.createMediaElementSource(el);
          srcNode.connect(analyser);          // 分析支路（静音）
          srcNode.connect(c.destination);     // 播放支路（可听）
        } catch (e) { srcNode = null; }
      }
      mode = 'file';
      name = file.name || '音频';
      return name;
    },

    play() {
      if (!isBrowser) return;
      ensureCtx(); resume();
      if (mode === 'file' && el) { const p = el.play(); if (p && p.catch) p.catch(() => {}); }
    },

    pause() {
      if (el) { try { el.pause(); } catch (e) {} }
    },

    stop() {
      if (el) { try { el.pause(); el.currentTime = 0; } catch (e) {} }
      if (mode === 'mic') this.micOff();
    },

    micOn() {
      if (!isBrowser || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
      const c = ensureCtx(); if (!c) return;
      resume();
      navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        detach();
        micStream = stream;
        try {
          srcNode = c.createMediaStreamSource(stream);
          srcNode.connect(analyser);
        } catch (e) { srcNode = null; }
        mode = 'mic';
        name = '麦克风';
      }).catch(() => {});
    },

    micOff() {
      if (mode !== 'mic') return;
      detach();
      mode = 'none';
      name = '';
    },

    // 系统音频（浏览器无 loopback 能力时退化为麦克风）
    systemOn() { this.micOn(); },

    seek(permille) {
      if (mode !== 'file' || !el) return;
      const p = Math.max(0, Math.min(1000, Math.trunc(permille))) / 1000;
      const len = isFinite(el.duration) ? el.duration : 0;
      if (len > 0) { try { el.currentTime = len * p; } catch (e) {} }
    },

    // "playing|posMs|lenMs|name"
    state() {
      let playing = 0, pos = 0, len = 0;
      if (mode === 'file' && el) {
        playing = (!el.paused && !el.ended) ? 1 : 0;
        pos = Math.round((el.currentTime || 0) * 1000);
        len = isFinite(el.duration) ? Math.round(el.duration * 1000) : 0;
      } else if (mode === 'mic') {
        playing = 1;
      }
      return playing + '|' + pos + '|' + len + '|' + name;
    },

    // 第 i 个频段（共 n 个）的幅度 0..100；对数分频，低频更密（贴近听感）
    band(i, n) {
      if (!analyser || !data) return 0;
      const total = analyser.frequencyBinCount;
      analyser.getByteFrequencyData(data);
      let lo = 0, hi = total - 1;
      if (n > 0) {
        // 对数映射：band 0 从 0Hz 起，band n-1 到奈奎斯特
        const a = Math.pow(total, i / n);
        const b = Math.pow(total, (i + 1) / n);
        lo = Math.floor(a); hi = Math.ceil(b);
        if (hi <= lo) hi = lo + 1;
        if (hi > total) hi = total;
      }
      let sum = 0, cnt = 0;
      for (let k = lo; k < hi; k++) { sum += data[k]; cnt++; }
      if (!cnt) return 0;
      return Math.round((sum / cnt) * 100 / 255);
    },

    // 提示音：正弦振荡 + 指数包络
    beep(freq, ms) {
      if (!isBrowser) return;
      const c = ensureCtx(); if (!c) return;
      resume();
      const f = Math.max(60, Math.min(4000, Math.trunc(freq) || 880));
      const dur = Math.max(40, Math.min(4000, Math.trunc(ms) || 160)) / 1000;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.35, c.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start();
      osc.stop(c.currentTime + dur + 0.02);
    },

    dispose() { detach(); },
  };
}
