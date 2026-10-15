/* ============================================================
 *  玩法自检：复活系统 + 神奶蛙清场 + 一键合成
 *  运行：node gameplay.test.js
 *
 *  覆盖：
 *    · 每累计 2000 分发一枚复活币（跨阈值、不重复发、可累计）
 *    · 复活币只在本局有效，reset() 清零
 *    · 越线时有次数才弹询问屏，没次数直接结算
 *    · revive()：消耗一次、清掉警戒线以上的水果、解除判负、没次数返回 false
 *    · 两只神奶蛙相撞：一起消失、+500、大字飘分、定格、额外送一枚复活币
 *    · 一键合成：每 500 分攒一次、重开清零、级联合到合不动为止、
 *                没得合不扣次数、点胶囊能触发、神奶蛙照原规则炸
 *    · 连掉两颗：30% 概率多掉一颗、两颗不同级、延后进场、
 *                重开 / 判负会作废待掉的那颗
 * ============================================================ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = __dirname;

function makeCtx() {
  const g = { addColorStop() {} };
  return {
    setTransform() {}, save() {}, restore() {}, scale() {}, rotate() {}, translate() {},
    clearRect() {}, fillRect() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    arc() {}, ellipse() {}, clip() {}, stroke() {}, fill() {}, setLineDash() {},
    drawImage() {}, createLinearGradient: () => g, createRadialGradient: () => g,
    measureText: () => ({ width: 10 }), fillText() {}, strokeText() {},
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1,
    font: '', textAlign: '', textBaseline: '', lineCap: ''
  };
}

function makeEl(id) {
  const el = {
    id, style: {}, textContent: '', width: 680, height: 112,
    hidden: false, disabled: false, offsetWidth: 100, _c: new Set(), _h: {},
    classList: {
      add: (c) => el._c.add(c), remove: (c) => el._c.delete(c), contains: (c) => el._c.has(c)
    },
    getContext: () => el._ctx || (el._ctx = makeCtx()),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 450, height: 738 }),
    addEventListener(t, fn) { el._h[t] = fn; },
    click() { if (el._h.click) el._h.click({ preventDefault() {} }); },
    querySelector: () => ({ textContent: '', style: {}, classList: { add() {}, remove() {} } }),
    setAttribute() {}, focus() {}, select() {}, blur() {}
  };
  return el;
}

const els = {};
['game', 'stage', 'overlay', 'score', 'best', 'finalScore', 'finalBest', 'next', 'chain',
 'soundBtn', 'resetBtn', 'restartBtn', 'revivePrompt', 'overPanel', 'reviveScore',
 'reviveLeft', 'reviveBtn', 'giveUpBtn', 'reviveBadge', 'reviveCount',
 'mergeBtn', 'mergeCount', 'mergeText',
 'boardBtn', 'boardBtn2', 'boardModal', 'boardList', 'boardClose', 'boardRefresh',
 'nickInput', 'myNameLabel', 'submitBtn', 'submitBox', 'submitMsg', 'editNameBtn',
 'sponsorModal', 'sponsorBtn', 'sponsorClose', 'sponsorOk'
].forEach((id) => { els[id] = makeEl(id); });
els.revivePrompt.hidden = true;
els.overPanel.hidden = false;
els.reviveBadge.hidden = true;
els.mergeBtn.hidden = true;

const winListeners = {};
const sandbox = {
  console, Math, Date, JSON, Object, Array, Number, String, Boolean, Error, isNaN, parseFloat, parseInt,
  performance: { now: () => Date.now() },
  requestAnimationFrame() { return 1; },
  setTimeout, clearTimeout, setInterval, clearInterval,
  document: {
    readyState: 'complete',
    getElementById: (id) => els[id] || null,
    addEventListener() {}, createElement: () => makeEl('tmp'),
    querySelector: () => null, querySelectorAll: () => []
  },
  localStorage: {
    _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }
  },
  addEventListener(t, fn) { winListeners[t] = fn; },
  navigator: {},
  Image: class {
    constructor() { this.width = 512; this.height = 512; this.naturalWidth = 512; }
    set src(v) { this._src = v; if (this.onload) this.onload(); }
    get src() { return this._src; }
  }
};
sandbox.window = sandbox;
sandbox.window.addEventListener = (t, fn) => { winListeners[t] = fn; };
vm.createContext(sandbox);
const load = (f) => vm.runInContext(fs.readFileSync(path.join(root, 'v1', f), 'utf8'), sandbox, { filename: f });
load('assets/fruits/parts.js');
load('game.js');

let gameOverCalls = 0;
sandbox.window.DanaiwaBoard = { onGameOver() { gameOverCalls++; return 'orig'; } };

const G = sandbox.window.__DNW__;

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra ? '  → ' + extra : '')); }
}
function eq(a, b, label) { ok(a === b, label, 'got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }

const ball = (y, r) => ({ x: 200, y, r: r || 30, dead: false, landed: true, overTime: 0, vx: 0, vy: 0, tier: 0 });

console.log('玩法自检：复活 + 清场\n');

/* ---------- A. 复活发放 ---------- */
console.log('[A] 每 2000 分发一枚复活币');
G.reset();
eq(G.state.revives, 0, '开局 0 次');
G.addScore(1999);
eq(G.state.revives, 0, '1999 分还是 0 次');
G.addScore(1);
eq(G.state.revives, 1, '到 2000 分 → 1 次');
G.addScore(1);
eq(G.state.revives, 1, '2001 分不会重复发');
G.addScore(1999);
eq(G.state.revives, 2, '到 4000 分 → 2 次');
G.addScore(2500);
eq(G.state.revives, 3, '一次跨两个阈值（6500 分）→ 3 次');
eq(G.state.reviveGiven, 3, '已发放次数对得上');
eq(els.reviveBadge.hidden, false, '徽章显示出来了');
eq(els.reviveCount.textContent, '×3', '胶囊文案正确');

/* ---------- B. 只在本局有效 ---------- */
console.log('\n[B] 复活币只在本局有效');
G.reset();
eq(G.state.revives, 0, '重开后清零');
eq(G.state.reviveGiven, 0, '发放记录也清零');
eq(els.reviveBadge.hidden, true, '徽章跟着隐藏');

/* ---------- C. 越线时的两屏 ---------- */
console.log('\n[C] 越线时：有次数先问，没次数直接结算');
G.reset();
gameOverCalls = 0;
G.state.balls = [ball(600), ball(300)];
G.gameOver();
eq(els.overlay.classList.contains('show'), true, '遮罩弹出');
eq(els.revivePrompt.hidden, true, '没次数 → 不弹询问屏');
eq(els.overPanel.hidden, false, '直接是结算屏');
eq(gameOverCalls, 1, '成绩已提交');

G.reset();
gameOverCalls = 0;
G.addScore(2000);
G.state.balls = [ball(600), ball(300), ball(120)];
G.gameOver();
eq(els.revivePrompt.hidden, false, '有次数 → 弹询问屏');
eq(els.overPanel.hidden, true, '结算屏让位');
eq(els.reviveScore.textContent, 2000, '询问屏显示本局得分');
eq(els.reviveLeft.textContent, '还剩 1 枚', '显示剩余枚数');
eq(gameOverCalls, 0, '还没提交成绩');

/* ---------- D. revive() 本身 ---------- */
console.log('\n[D] revive()：消耗一次、清掉线上的水果');
G.state.balls = [ball(660, 40), ball(600, 40), ball(120, 40), ball(200, 40), ball(100, 40)];
G.state.balls.forEach((b) => { b.overTime = 1.4; });
G.state.over = true;
eq(G.revive(), true, 'revive() 返回 true');
eq(G.state.revives, 0, '次数扣掉一次');
eq(G.state.over, false, '解除判负');
ok(G.state.balls.every((b) => b.y - b.r >= 134), '留下的全在警戒线以下');
eq(G.state.balls.length, 3, '线上的两颗被清掉');
ok(G.state.balls.every((b) => b.overTime === 0), '越线计时清零');
eq(els.revivePrompt.hidden, true, '询问屏收起');
eq(els.overlay.classList.contains('show'), false, '遮罩收起');
eq(els.reviveBadge.hidden, true, '次数归零 → 徽章隐藏');

eq(G.revive(), false, '没次数时再调返回 false');
eq(G.revive(), false, '没判负时也返回 false');

/* ---------- E. 神奶蛙清场 ---------- */
console.log('\n[E] 两只神奶蛙一起炸掉');
G.reset();
const r10 = G.FRUITS[10].r;
G.state.balls.length = 0;
const wa = G.makeBall(210, 500, 10, 0, 0); wa.landed = true; wa.py = wa.y;
const wb = G.makeBall(210, 500 - (2 * r10 + 0.6), 10, 0, 0); wb.landed = true; wb.py = wb.y;
G.state.balls.push(wa, wb);
eq(G.state.balls.length, 2, '先摆好两只神奶蛙');

let merged = false;
for (let i = 0; i < 60 && !merged; i++) {
  G.stepPhysics(1 / 60);
  if (G.state.balls.length === 0) merged = true;
}
ok(merged, '两只神奶蛙相撞后一起消失');
eq(G.state.score, G.MAX_BONUS, '得分正好是 MAX_BONUS');
eq(G.MAX_BONUS, 500, 'MAX_BONUS 是 500（原来是 100）');
ok(G.state.freeze > 0, '触发了定格（freeze > 0）');
ok(G.state.freeze <= 0.2, '定格时长合理（≤200ms）');
const bigFloat = G.state.floats.filter((f) => f.big);
eq(bigFloat.length, 1, '有且只有一个大字飘分（不会和普通飘字重复）');
eq(bigFloat[0].text, '+500', '大字写的是 +500');
eq(G.state.floats.length, 3, '三行飘字：大字 +500、小字说明、+1 一键合成');
ok(G.state.floats.some((f) => f.text.indexOf('两个神奶蛙') >= 0), '还有一行「两个神奶蛙」说明文字');
eq(G.state.revives, 1, '额外送了一枚复活币');
eq(els.reviveBadge.hidden, false, '徽章就此出现');
/* 顺带验一下这 500 分正好跨过 500 分的一键合成阈值 */
eq(G.state.oneClicks, 1, '+500 也攒到一次一键合成');
eq(els.mergeBtn.hidden, false, '一键合成胶囊一起出现');
ok(G.state.floats.some((f) => f.text.indexOf('一键合成') >= 0), '有「+1 一键合成」的飘字');

/* ---------- F. 定格会自己结束，不会卡死 ---------- */
console.log('\n[F] 定格会自己结束');
G.reset();
G.state.freeze = 0.13;
G.update(0.05);
ok(G.state.freeze > 0.07 && G.state.freeze < 0.09, '定格在倒计时（0.13 → 约 0.08）');
G.update(0.05);
G.update(0.05);
eq(G.state.freeze, 0, '倒计时结束后归零');
G.update(1 / 60);
eq(G.state.freeze, 0, '之后正常走更新，不报错');

/* ---------- G. 一键合成 ---------- */
function mkBall(tier, x, y) {
  const b = G.makeBall(x, y, tier, 0, 0);
  b.landed = true; b.px = b.x; b.py = b.y;
  return b;
}
/* 把级联一次跑到底（每步喂一个 tick；合不动时它自己会把 autoMerge 关掉） */
function runCascade() {
  let guard = 0;
  while (G.state.autoMerge && guard < 600) { G.stepAutoMerge(G.ONE_CLICK_TICK); guard++; }
  return guard;
}

console.log('\n[G] 一键合成：每 500 分攒一次机会');
eq(G.ONE_CLICK_STEP, 500, 'ONE_CLICK_STEP 是 500');
G.reset();
eq(G.state.oneClicks, 0, '开局 0 次');
G.addScore(499);
eq(G.state.oneClicks, 0, '499 分还是 0 次');
G.addScore(1);
eq(G.state.oneClicks, 1, '到 500 分 → 1 次');
G.addScore(1);
eq(G.state.oneClicks, 1, '501 分不会重复发');
G.addScore(999);
eq(G.state.oneClicks, 3, '到 1500 分 → 3 次');
eq(G.state.oneClickGiven, 3, '已发放次数对得上');
eq(els.mergeBtn.hidden, false, '胶囊显示出来了');
eq(els.mergeCount.textContent, '×3', '胶囊文案正确');
eq(els.mergeText.textContent, '一键合成', '按钮文案正确');

G.reset();
eq(G.state.oneClicks, 0, '重开后清零');
eq(G.state.oneClickGiven, 0, '发放记录也清零');
eq(els.mergeBtn.hidden, true, '胶囊跟着隐藏');

console.log('\n[G] 级联：一直合到合不动为止');
G.reset();
G.state.oneClicks = 1;
G.paintOneClicks(false);
eq(els.mergeBtn.hidden, false, '有次数 → 胶囊出现');
G.state.balls.length = 0;
G.state.balls.push(mkBall(0, 100, 700), mkBall(0, 160, 700),
                   mkBall(0, 220, 700), mkBall(0, 280, 700), mkBall(1, 340, 700));
eq(G.state.balls.length, 5, '先摆好 4 葡萄 + 1 樱桃');

G.useOneClick();
eq(G.state.oneClicks, 0, '用掉一次机会');
eq(G.state.autoMerge, true, '级联开始了');
eq(els.mergeBtn.disabled, true, '合成中胶囊置灰');
eq(els.mergeText.textContent, '合成中…', '合成中换文案');

runCascade();
eq(G.state.autoMerge, false, '级联合完会自己停');
eq(els.mergeBtn.disabled, false, '结束后解除置灰');
eq(G.state.balls.map((b) => b.tier).sort((a, b) => a - b).join(','), '1,2',
   '最后剩 1 只樱桃 + 1 只橘子（再没有同级的两个）');
ok(G.state.score > 0, '合成是有分的（score=' + G.state.score + '）');

/* 没有同级的两个 → 不该白白扣掉机会 */
G.reset();
G.state.oneClicks = 2;
G.state.balls.length = 0;
G.state.balls.push(mkBall(0, 200, 700), mkBall(1, 300, 700));
G.useOneClick();
eq(G.state.oneClicks, 2, '没得合就不扣次数');
eq(G.state.autoMerge, false, '也不会启动级联');
ok(G.state.floats.some((f) => f.text.indexOf('没有可以合成') >= 0), '给了「没有可以合成的」提示');

/* 点胶囊按钮本身能触发（确认事件真的接上了） */
G.reset();
G.state.oneClicks = 1;
G.paintOneClicks(false);
G.state.balls.length = 0;
G.state.balls.push(mkBall(0, 200, 700), mkBall(0, 260, 700));
els.mergeBtn.click();
eq(G.state.autoMerge, true, '点胶囊能触发一键合成');
runCascade();

/* 两只神奶蛙在一键合成里照样走原规则：一起炸掉、+500、送复活币 */
G.reset();
G.state.oneClicks = 1;
G.paintOneClicks(false);
G.state.balls.length = 0;
const r10t = G.FRUITS[10].r;
G.state.balls.push(mkBall(10, 140, 700), mkBall(10, 140 + 2 * r10t + 1, 700));
G.useOneClick();
runCascade();
eq(G.state.balls.length, 0, '两只神奶蛙一起消失');
eq(G.state.score, G.MAX_BONUS, '得分正好是 MAX_BONUS');
eq(G.state.revives, 1, '照样送一枚复活币');
eq(G.state.oneClicks, 1, '+500 又攒回一次一键合成');

/* ---------- H. 连掉两颗 ---------- */
console.log('\n[H] 连掉两颗：有概率多掉一颗，且两颗不同级');
/* 临时接管 Math.random（沙箱里的 Math 就是本进程的 Math），用来把概率钉死 */
function withRandom(vals, fn) {
  const orig = Math.random;
  let i = 0;
  Math.random = () => (i < vals.length ? vals[i++] : 0.99);
  try { return fn(); } finally { Math.random = orig; }
}
function armUp(pending, next) {
  G.reset();
  G.state.balls.length = 0;
  G.state.ready = true;
  G.state.pending = pending;
  G.state.next = next;
}

eq(G.DOUBLE_CHANCE, 0.30, 'DOUBLE_CHANCE 是 30%');
eq(G.DOUBLE_DELAY, 0.16, 'DOUBLE_DELAY 是 0.16 秒');

/* 掷中：第一颗用「当前」，第二颗就是原来的「下一个」——天然不同级 */
armUp(0, 2);
withRandom([0.0], () => G.tryDrop());          // 0.0 < 0.30 → 掷中
const firstH = G.state.balls[G.state.balls.length - 1];
eq(G.state.balls.length, 1, '第一颗先落，第二颗要等一会儿');
eq(G.state.bonus.tier, 2, '待掉的就是原来的「下一个」（橘子）');
ok(G.state.bonus.tier !== firstH.tier, '两颗不是同一级');
eq(G.state.bonus.x, firstH.x, '两颗落在同一个横向位置');

G.stepBonusDrop(G.DOUBLE_DELAY - 0.01);
eq(G.state.balls.length, 1, '差一点点还不掉');
G.stepBonusDrop(0.02);
eq(G.state.balls.length, 2, '时间到 → 第二颗进场');
eq(G.state.bonus, null, '待掉状态清干净');
eq(G.state.balls[1].tier, 2, '第二颗的等级正确');
ok(G.state.balls[0].tier !== G.state.balls[1].tier, '场内两颗确实不一样');

/* 没掷中：只掉一颗，也不留尾巴 */
armUp(0, 2);
withRandom([0.9], () => G.tryDrop());          // 0.9 ≥ 0.30 → 没中
eq(G.state.balls.length, 1, '没掷中 → 只掉一颗');
eq(G.state.bonus, null, '也不留待掉状态');
G.stepBonusDrop(5);
eq(G.state.balls.length, 1, '过再久也不会冒出第二颗');

/* 待掉的那颗会被作废，不会隔一局诈尸 */
armUp(0, 2);
withRandom([0.0], () => G.tryDrop());
ok(!!G.state.bonus, '先排上一颗待掉的');
G.gameOver();
eq(G.state.bonus, null, '判负时作废');

armUp(0, 2);
withRandom([0.0], () => G.tryDrop());
ok(!!G.state.bonus, '再排一颗');
G.reset();
eq(G.state.bonus, null, '重开时作废');

/* 大样本验一下概率真的接上了（±3σ 之外才算失败，避免偶发） */
armUp(0, 2);
let doubles = 0;
const N = 400;
for (let i = 0; i < N; i++) {
  G.state.ready = true;
  G.tryDrop();
  if (G.state.bonus) doubles++;
  G.state.bonus = null;
  if (G.state.balls.length > 40) G.state.balls.length = 0;
}
const rate = doubles / N;
ok(rate > 0.22 && rate < 0.38, '连掉率落在 30% 附近（实测 ' + (rate * 100).toFixed(1) + '%）');

console.log('\n' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
