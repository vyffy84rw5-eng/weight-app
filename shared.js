// 体重ペース 共通部品（計算・グラフ・表）。index.html と admin.html で使う。
(() => {
  const MIN_DAYS = 3;     // 週の平均を予測に使う最低日数
  const FIT_WEEKS = 4;    // 予測に使う直近の週数
  const DAY = 86400000;

  // ---------- 日付・表示 ----------
  const pad = n => String(n).padStart(2, '0');
  const ymd = dt => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const md = dt => `${dt.getMonth() + 1}/${dt.getDate()}`;
  const WD = ['日', '月', '火', '水', '木', '金', '土'];
  function mondayOf(dt) {
    const x = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }
  const fmt = v => Number(v).toFixed(1);
  const signed = v => (Math.abs(v) < 0.05 ? '±' : v > 0 ? '+' : '−') + Math.abs(v).toFixed(1);
  const cls = v => Math.abs(v) < 0.05 ? '' : v < 0 ? 'down' : 'up';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- 計算 ----------
  // data: { 'YYYY-MM-DD': kg }
  function weeks(data) {
    const map = new Map();
    Object.keys(data).sort().forEach(k => {
      const mon = ymd(mondayOf(parse(k)));
      if (!map.has(mon)) map.set(mon, []);
      map.get(mon).push(Number(data[k]));
    });
    return [...map.entries()].map(([mon, vals]) => ({
      mon, start: parse(mon), n: vals.length,
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
    }));
  }
  // 直近の「3日以上ある週」を最大4週、週番号で直線あてはめ
  function forecast(ws) {
    const ok = ws.filter(w => w.n >= MIN_DAYS).slice(-FIT_WEEKS);
    if (ok.length < 2) return null;
    const t0 = ok[0].start.getTime();
    const xs = ok.map(w => Math.round((w.start.getTime() - t0) / (7 * DAY)));
    const ys = ok.map(w => w.avg);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let sxy = 0, sxx = 0;
    xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; });
    const perWeek = sxx ? sxy / sxx : 0;
    const last = ok[ok.length - 1];
    const perMonth = perWeek * 30 / 7;
    return { used: ok, perWeek, perMonth, from: last, in1m: last.avg + perMonth };
  }

  // ---------- 数字のカード ----------
  function renderStats(el, ws, fc) {
    if (!ws.length) { el.innerHTML = ''; return; }
    const cur = ws[ws.length - 1];
    const prev = ws.length > 1 ? ws[ws.length - 2] : null;
    const diff = prev ? cur.avg - prev.avg : null;
    let hero;
    if (fc) {
      hero = `<div class="stat hero">
        <div class="label">1か月のペース（予測）</div>
        <div class="value ${cls(fc.perMonth)}">${signed(fc.perMonth)}<small>kg / 月</small></div>
        <div class="note">直近${fc.used.length}週の平均から。1週あたり ${signed(fc.perWeek)}kg</div>
      </div>`;
    } else {
      const need = ws.filter(w => w.n >= MIN_DAYS).length;
      hero = `<div class="stat hero">
        <div class="label">1か月のペース（予測）</div>
        <div class="value" style="color:var(--text-3)">—</div>
        <div class="note">記録が${MIN_DAYS}日以上ある週が2つそろうと出ます（いま${need}週）</div>
      </div>`;
    }
    el.innerHTML = hero + `
      <div class="stat">
        <div class="label">今週の平均</div>
        <div class="value">${fmt(cur.avg)}<small>kg</small></div>
        <div class="note">${md(cur.start)}〜　${cur.n}日分</div>
      </div>
      <div class="stat">
        <div class="label">先週との差</div>
        <div class="value ${diff == null ? '' : cls(diff)}">${diff == null ? '—' : signed(diff)}<small>${diff == null ? '' : 'kg'}</small></div>
        <div class="note">${prev ? `先週 ${fmt(prev.avg)}kg` : '先週の記録なし'}</div>
      </div>
      ${fc ? `<div class="stat hero">
        <div class="label">1か月後の予測</div>
        <div class="value">${fmt(fc.in1m)}<small>kg</small></div>
        <div class="note">このペースが続いた場合の週の平均</div>
      </div>` : ''}`;
  }

  // ---------- グラフ ----------
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }

  // 1つのグラフ部品を作る。els = { svg, tip, legend }
  function createChart(els) {
    let hits = [];
    function draw(data, ws, fc) {
      const svg = els.svg;
      svg.innerHTML = '';
      hits = [];
      const keys = Object.keys(data).sort();
      const emptyId = svg.id + '-empty';
      if (!keys.length) {
        svg.hidden = true; if (els.legend) els.legend.hidden = true;
        if (!document.getElementById(emptyId)) { const p = document.createElement('div'); p.id = emptyId; p.className = 'empty'; p.textContent = '記録するとグラフが出ます'; svg.after(p); }
        return;
      }
      svg.hidden = false; if (els.legend) els.legend.hidden = false;
      const em = document.getElementById(emptyId); if (em) em.remove();

      const W = svg.clientWidth || 340, H = 240;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const L = 40, R = 12, T = 14, B = 26;

      const first = ws[0].start.getTime();
      const lastWeek = ws[ws.length - 1].start.getTime();
      const fcEnd = fc ? fc.from.start.getTime() + 30 * DAY + 3.5 * DAY : 0;
      const x0 = first, x1 = Math.max(lastWeek + 7 * DAY, fcEnd);
      const centerOf = w => w.start.getTime() + 3.5 * DAY; // 週の真ん中（木曜）に置く

      const vals = keys.map(k => Number(data[k])).concat(ws.map(w => w.avg));
      if (fc) vals.push(fc.in1m);
      let lo = Math.min(...vals), hi = Math.max(...vals);
      const span = Math.max(hi - lo, 2);
      const mid = (lo + hi) / 2;
      lo = mid - span / 2 - span * 0.1; hi = mid + span / 2 + span * 0.1;
      const step = niceStep((hi - lo) / 4);
      lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;

      const X = t => L + (t - x0) / (x1 - x0) * (W - L - R);
      const Y = v => T + (hi - v) / (hi - lo) * (H - T - B);

      const g = mk('g', {});
      for (let v = lo; v <= hi + 1e-9; v += step) {
        g.append(mk('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), stroke: 'var(--grid)', 'stroke-width': 1 }));
        const t = mk('text', { x: L - 6, y: Y(v) + 4, 'text-anchor': 'end' }); t.textContent = step < 1 ? v.toFixed(1) : v.toFixed(0); g.append(t);
      }
      const allWeeks = [];
      for (let t = x0; t < x1; t += 7 * DAY) allWeeks.push(t);
      const every = Math.max(1, Math.ceil(allWeeks.length / Math.max(2, Math.floor((W - L - R) / 56))));
      allWeeks.forEach((t, i) => {
        if (i % every) return;
        const tx = mk('text', { x: X(t + 3.5 * DAY), y: H - 8, 'text-anchor': 'middle' }); tx.textContent = md(new Date(t)) + '週'; g.append(tx);
      });
      svg.append(g);

      keys.forEach(k => {
        const t = parse(k).getTime() + DAY / 2;
        svg.append(mk('circle', { cx: X(t), cy: Y(Number(data[k])), r: 2.5, fill: 'var(--dot)' }));
      });

      if (fc) {
        const sx = X(centerOf(fc.from)), sy = Y(fc.from.avg);
        const ex = X(centerOf(fc.from) + 30 * DAY), ey = Y(fc.in1m);
        svg.append(mk('line', { x1: sx, y1: sy, x2: ex, y2: ey, stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-dasharray': '5 5', opacity: .7, 'stroke-linecap': 'round' }));
        svg.append(mk('circle', { cx: ex, cy: ey, r: 4, fill: 'var(--card)', stroke: 'var(--accent)', 'stroke-width': 2 }));
        const lb = mk('text', { x: Math.min(ex, W - R), y: ey - 10, 'text-anchor': 'end', style: 'fill:var(--text-2);font-weight:600' });
        lb.textContent = `1か月後 ${fmt(fc.in1m)}`;
        svg.append(lb);
        hits.push({ x: ex, y: ey, html: `1か月後の予測<br><b>${fmt(fc.in1m)} kg</b>` });
      }

      const pts = ws.map(w => [X(centerOf(w)), Y(w.avg), w]);
      if (pts.length > 1) {
        svg.append(mk('path', { d: pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' '), fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      }
      pts.forEach(([x, y, w]) => {
        const thin = w.n < MIN_DAYS;
        svg.append(mk('circle', { cx: x, cy: y, r: 4.5, fill: thin ? 'var(--card)' : 'var(--accent)', stroke: thin ? 'var(--accent)' : 'var(--card)', 'stroke-width': 2 }));
        hits.push({ x, y, html: `${md(w.start)}〜の週（${w.n}日）<br><b>平均 ${fmt(w.avg)} kg</b>${thin ? '<br>日数が少なく予測には未使用' : ''}` });
      });
      const lp = pts[pts.length - 1];
      if (lp && !fc) {
        const t = mk('text', { x: lp[0], y: lp[1] - 10, 'text-anchor': 'middle', style: 'fill:var(--text-2);font-weight:600' }); t.textContent = fmt(lp[2].avg); svg.append(t);
      }
    }
    function showTip(ev) {
      if (!hits.length) return;
      const svg = els.svg, r = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal, sc = r.width / vb.width;
      const px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      let best = null, bd = Infinity;
      hits.forEach(h => { const d = Math.abs(h.x * sc - px); if (d < bd) { bd = d; best = h; } });
      const tip = els.tip;
      if (!best || bd > 40) { tip.style.opacity = 0; return; }
      tip.innerHTML = best.html;
      const half = tip.offsetWidth / 2;
      tip.style.left = Math.min(Math.max(best.x * sc, half), r.width - half) + 'px';
      tip.style.top = (best.y * sc - 10) + 'px';
      tip.style.opacity = 1;
    }
    els.svg.addEventListener('pointermove', showTip);
    els.svg.addEventListener('pointerdown', showTip);
    els.svg.addEventListener('pointerleave', () => { els.tip.style.opacity = 0; });
    return { draw };
  }

  // ---------- 週の表 ----------
  function renderWeeks(el, ws) {
    if (!ws.length) { el.innerHTML = '<div class="empty">まだ記録がありません</div>'; return; }
    const rows = ws.slice().reverse().map((w, i, arr) => {
      const prev = arr[i + 1];
      const d = prev ? w.avg - prev.avg : null;
      return `<tr><td>${md(w.start)}〜</td><td class="r muted">${w.n}日</td><td class="r">${fmt(w.avg)}</td>
        <td class="r ${d == null ? 'muted' : cls(d)}">${d == null ? '—' : signed(d)}</td></tr>`;
    }).join('');
    el.innerHTML = `<table><thead><tr><th>週</th><th class="r">日数</th><th class="r">平均kg</th><th class="r">前週比</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  // ---------- 目標ペース ----------
  // goal = { target_kg, target_day, height_cm, age, sex, activity }
  function goalHtml(goal, data, ws, fc, todayStr) {
    const keys = Object.keys(data).sort();
    if (!keys.length) return '<div class="line">体重を記録すると計算します。</div>';
    const now = ws.length ? ws[ws.length - 1].avg : Number(data[keys[keys.length - 1]]);
    const target = parseFloat(goal.target_kg), until = goal.target_day;
    if (!(target >= 20) || !until) return `<div class="line">目標の体重と日付を入れると、必要なペースを出します。<br>今の体重（今週の平均）: <b>${fmt(now)} kg</b></div>`;
    const days = Math.round((parse(until) - parse(todayStr)) / DAY);
    if (days < 7) return '<div class="line">日付は1週間以上先にしてください。</div>';
    const total = target - now;
    const perMonth = total / days * 30;
    const perWeek = total / days * 7;
    const pctWeek = Math.abs(perWeek) / now * 100;
    const kcalDay = Math.abs(total) * 7200 / days;

    let html = `<div class="label" style="font-size:12px;color:var(--text-2)">今月がんばるペース</div>
      <div class="big ${perMonth < 0 ? 'down' : 'up'}">${signed(perMonth)}<small>kg / 月</small></div>
      <div class="line">${fmt(now)}kg → ${fmt(target)}kg（${signed(total)}kg）を ${days}日で。1週あたり <b>${signed(perWeek)}kg</b></div>`;
    const h = parseFloat(goal.height_cm), a = parseFloat(goal.age);
    if (h > 0 && a > 0) {
      const bmr = 10 * now + 6.25 * h - 5 * a + (goal.sex === 'f' ? -161 : 5);
      const tdee = bmr * (parseFloat(goal.activity) || 1.55);
      const eat = total < 0 ? tdee - kcalDay : tdee + kcalDay;
      html += `<div class="line">1日に使う量の目安 <b>${Math.round(tdee).toLocaleString()}kcal</b>。そのために1日 <b>${Math.round(kcalDay).toLocaleString()}kcal</b> ${total < 0 ? '減らす' : '増やす'} → 食べる量は <b>${Math.round(eat).toLocaleString()}kcal</b> くらい</div>`;
    } else {
      html += '<div class="line">身長と年齢を入れると、1日に食べる量の目安も出します。</div>';
    }
    if (fc) {
      const gap = fc.perMonth - perMonth;
      const onTrack = total < 0 ? fc.perMonth <= perMonth : fc.perMonth >= perMonth;
      html += `<div class="line">いまの実績ペースは <b>${signed(fc.perMonth)}kg/月</b>。${onTrack ? '目標に間に合うペースです。' : `あと <b>${Math.abs(gap).toFixed(1)}kg/月</b> ${total < 0 ? '多く落とす' : '多く増やす'}必要があります。`}</div>`;
    }
    if (total < 0) {
      html += pctWeek <= 1
        ? `<span class="badge ok">無理のないペース（1週に体重の${pctWeek.toFixed(1)}%）</span>`
        : `<span class="badge warn">速すぎるペース（1週に体重の${pctWeek.toFixed(1)}%）。日付を先にのばすのがおすすめ</span>`;
    }
    return html;
  }


  // ---------- 1日の目安kcal（Mifflin-St Jeor × 運動の習慣） ----------
  function tdeeOf(goal, nowKg) {
    const h = parseFloat(goal.height_cm), a = parseFloat(goal.age);
    if (!(h > 0 && a > 0 && nowKg > 0)) return null;
    const bmr = 10 * nowKg + 6.25 * h - 5 * a + (goal.sex === 'f' ? -161 : 5);
    return bmr * (parseFloat(goal.activity) || 1.55);
  }
  // 目標に向けた1日の食事の目安（減量なら目安から不足分を引く）
  function kcalPlan(goal, nowKg, todayStr) {
    const tdee = tdeeOf(goal, nowKg);
    if (tdee == null) return null;
    const target = parseFloat(goal.target_kg), until = goal.target_day;
    let eat = tdee, diffDay = 0;
    if (target >= 20 && until) {
      const days = Math.round((parse(until) - parse(todayStr)) / DAY);
      if (days >= 7) { diffDay = (target - nowKg) * 7200 / days; eat = tdee + diffDay; }
    }
    return { tdee, eat, diffDay };
  }

  // ---------- 判定（順調／やや遅れ／要フォロー） ----------
  // 返す: { level: 'ok'|'slow'|'follow'|'wait'|'none', label, why, need, actual, monthEnd, waitDays }
  function judge(goal, data, todayStr) {
    const keys = Object.keys(data).sort();
    const ws = weeks(data), fc = forecast(ws);
    const out = { ws, fc, level: 'none', label: '', why: '' };
    if (!keys.length) return { ...out, level: 'follow', label: '要フォロー', why: 'まだ記録がありません' };
    const lastDay = keys[keys.length - 1];
    const gapDays = Math.round((parse(todayStr) - parse(lastDay)) / DAY);
    out.gapDays = gapDays;
    const now = ws[ws.length - 1].avg;
    out.now = now;

    // 目標まで
    const target = parseFloat(goal?.target_kg), until = goal?.target_day;
    if (target >= 20 && until) {
      const days = Math.round((parse(until) - parse(todayStr)) / DAY);
      out.remainKg = target - now; out.remainDays = days;
      if (days > 0) out.need = (target - now) / days * 30;
    }
    // 今月末の予想（今の週ペースのまま）
    if (fc) {
      const t = parse(todayStr);
      const monthEnd = new Date(t.getFullYear(), t.getMonth() + 1, 0);
      const daysLeft = Math.round((monthEnd - t) / DAY);
      out.monthEnd = { date: monthEnd, kg: now + fc.perWeek * daysLeft / 7 };
      out.actual = fc.perMonth;
    }

    if (gapDays > 7) return { ...out, level: 'follow', label: '要フォロー', why: `${gapDays}日間記録がありません` };
    if (!fc) {
      // 1日1回記録したとして、何日でペースが出るか数える
      const sim = { ...data };
      let n = 0;
      while (n < 21 && !forecast(weeks(sim))) { n++; const x = parse(todayStr); x.setDate(x.getDate() + n); sim[ymd(x)] = now; }
      return { ...out, level: 'wait', label: '判定まち', why: `判定にはあと${n}日（毎日記録した場合）`, waitDays: n };
    }
    // 減り方が速すぎる（1週に体重の1%超）は、目標の有無にかかわらず声かけ
    const pctWeek = -fc.perWeek / now * 100;
    if (pctWeek > 1) return { ...out, level: 'follow', label: '要フォロー', why: `減り方が速すぎます（1週に体重の${pctWeek.toFixed(1)}%）` };
    if (out.need == null) return { ...out, level: 'none', label: '目標なし', why: '目標を入れると判定します' };
    if (out.remainDays <= 0) return { ...out, level: Math.abs(out.remainKg) <= 0.5 ? 'ok' : 'follow', label: Math.abs(out.remainKg) <= 0.5 ? '順調' : '要フォロー', why: '目標の日を過ぎています' };
    const losing = out.remainKg < 0;
    if (Math.abs(out.remainKg) <= 0.3) return { ...out, level: 'ok', label: '順調', why: '目標の体重に届いています' };
    // 必要なペースに対して、実際のペースが何割出ているか
    const ratio = out.actual / out.need;    // 減量: どちらもマイナスなので正の比になる
    if (ratio >= 1) return { ...out, level: 'ok', label: '順調', why: '目標に間に合うペースです' };
    if (ratio >= 0.5) return { ...out, level: 'slow', label: 'やや遅れ', why: `必要なペースの${Math.round(ratio * 100)}%です` };
    return { ...out, level: 'follow', label: '要フォロー', why: ratio <= 0 ? (losing ? '体重が増えるペースです' : '体重が減るペースです') : `必要なペースの${Math.round(ratio * 100)}%です` };
  }
  const badge = j => `<span class="status s-${j.level}">${j.label}</span>`;


  // ---------- PFCバランス ----------
  // たんぱく質: 減量中は体重×2.0g、それ以外は×1.6g（ただし全体の35%まで）。脂質: 25%。炭水化物: 残り。
  function pfc(kcal, nowKg, losing) {
    if (!(kcal > 0 && nowKg > 0)) return null;
    let p = nowKg * (losing ? 2.0 : 1.6);
    p = Math.min(p, kcal * 0.35 / 4);
    const f = kcal * 0.25 / 9;
    const c = Math.max(0, (kcal - p * 4 - f * 9) / 4);
    return { kcal, p, f, c, pct: { p: p * 4 / kcal * 100, f: f * 9 / kcal * 100, c: c * 4 / kcal * 100 } };
  }

  // コンビニでそろう定番（1個あたりのおおよその値。商品により違う）
  const KONBINI = [
    { name: 'サラダチキン', p: 24, f: 1.5, c: 0.5, main: true },
    { name: 'ゆで卵', p: 6.5, f: 5, c: 0.3 },
    { name: '焼き鮭のパック', p: 18, f: 6, c: 0.5, main: true },
    { name: '焼き鳥（塩）2本', p: 17, f: 7, c: 2, main: true },
    { name: '豆腐バー', p: 11, f: 6, c: 3, main: true },
    { name: '納豆', p: 7, f: 4.5, c: 6 },
    { name: 'ギリシャヨーグルト（無糖）', p: 10, f: 0, c: 12 },
    { name: 'プロテイン飲料', p: 15, f: 0, c: 10 },
    { name: '鮭おにぎり', p: 5, f: 1.5, c: 38, carb: true },
    { name: 'もち麦おにぎり', p: 4, f: 1.5, c: 36, carb: true },
    { name: 'ご飯パック（小）', p: 4, f: 1.5, c: 51, carb: true },
    { name: 'ざるそば', p: 13, f: 2, c: 60, carb: true },
    { name: 'サンドイッチ（卵）', p: 10, f: 14, c: 26, carb: true },
    { name: 'バナナ', p: 1, f: 0.2, c: 22 },
    { name: '野菜サラダ', p: 1.5, f: 0.3, c: 5, veg: true },
    { name: '具だくさん味噌汁', p: 5, f: 3, c: 8, veg: true },
    { name: '無調整豆乳', p: 7, f: 6, c: 5 },
    { name: 'ミックスナッツ（小袋）', p: 5, f: 13, c: 4 },
  ].map(x => ({ ...x, kcal: x.p * 4 + x.f * 9 + x.c * 4 }));

  // 1食の目標に近い組み合わせ（2〜4品）を3つ。主菜か主食のどちらかは必ず入れる
  function mealExamples(target, count = 3) {
    const n = KONBINI.length, combos = [];
    const score = items => {
      const t = items.reduce((a, x) => ({ p: a.p + x.p, f: a.f + x.f, c: a.c + x.c, kcal: a.kcal + x.kcal }), { p: 0, f: 0, c: 0, kcal: 0 });
      const e = 2 * Math.abs(t.p - target.p) / target.p + Math.abs(t.f - target.f) / target.f + Math.abs(t.c - target.c) / Math.max(target.c, 10) + Math.abs(t.kcal - target.kcal) / target.kcal;
      return { items, t, e: e + (items.some(x => x.veg) ? 0 : 0.15) };   // 野菜が入る組み合わせを少し優先
    };
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      combos.push(score([KONBINI[a], KONBINI[b]]));
      for (let c = b + 1; c < n; c++) {
        combos.push(score([KONBINI[a], KONBINI[b], KONBINI[c]]));
        for (let d = c + 1; d < n; d++) combos.push(score([KONBINI[a], KONBINI[b], KONBINI[c], KONBINI[d]]));
      }
    }
    const ok = combos.filter(x => x.items.some(i => i.main) && x.items.some(i => i.carb || target.c < 25)).sort((x, y) => x.e - y.e);
    const picked = [];
    for (const x of ok) {
      // 似た組み合わせを避ける（同じ主菜は1回まで）
      const main = x.items.find(i => i.main)?.name;
      if (picked.some(y => y.items.find(i => i.main)?.name === main)) continue;
      picked.push(x);
      if (picked.length >= count) break;
    }
    return picked;
  }

  function pfcHtml(kcal, source, nowKg, losing) {
    const d = pfc(kcal, nowKg, losing);
    if (!d) return '';
    const meal = { kcal: d.kcal / 3, p: d.p / 3, f: d.f / 3, c: d.c / 3 };
    const g = v => Math.round(v);
    const bar = `<div class="pfc-bar" role="img" aria-label="たんぱく質${g(d.pct.p)}% 脂質${g(d.pct.f)}% 炭水化物${g(d.pct.c)}%">
        <span class="b-p" style="width:${d.pct.p}%"></span><span class="b-f" style="width:${d.pct.f}%"></span><span class="b-c" style="width:${d.pct.c}%"></span></div>`;
    const row = (cls, name, gram, pct) => `<div class="pfc-row"><span class="dot ${cls}"></span><span>${name}</span><b>${g(gram)}g</b><span class="muted">${g(pct)}%</span></div>`;
    const ex = mealExamples(meal).map((x, i) => `<div class="meal">
        <div class="meal-head"><b>例${'ABC'[i]}</b><span>${g(x.t.kcal)}kcal・P${g(x.t.p)} F${g(x.t.f)} C${g(x.t.c)}</span></div>
        <div class="meal-items">${x.items.map(it => esc(it.name)).join(' ＋ ')}</div></div>`).join('');
    return `<div class="pfc">
      <div class="pfc-title">1日 <b>${Math.round(d.kcal).toLocaleString()}kcal</b> のPFCバランス<span class="muted">（${source}）</span></div>
      ${bar}
      <div class="pfc-rows">${row('b-p', 'たんぱく質', d.p, d.pct.p)}${row('b-f', '脂質', d.f, d.pct.f)}${row('b-c', '炭水化物', d.c, d.pct.c)}</div>
      <div class="pfc-title" style="margin-top:14px">1食あたり（3食）<b>${g(meal.kcal)}kcal</b>・P${g(meal.p)}g F${g(meal.f)}g C${g(meal.c)}g</div>
      <div class="meals">${ex}</div>
      <div class="muted" style="font-size:12px;margin-top:6px">コンビニの定番品で組んだ例です。数値は目安で、商品によって違います。</div>
    </div>`;
  }


  // ---------- 食事の振り返り（0=設定どおり 1=少しオーバー 2=かなりオーバー） ----------
  const MEAL_LABELS = ['設定どおり', '少しオーバー', 'かなりオーバー'];
  // 直近14日（昨日まで）の集計
  function mealStats(meals, todayStr, span = 14) {
    const to = parse(todayStr); to.setDate(to.getDate() - 1);
    const from = new Date(to); from.setDate(from.getDate() - (span - 1));
    const a = ymd(from), b = ymd(to);
    const rows = Object.entries(meals || {}).filter(([d]) => d >= a && d <= b);
    const cnt = [0, 0, 0]; rows.forEach(([, r]) => cnt[r]++);
    const n = rows.length;
    return { span, n, ok: cnt[0], little: cnt[1], over: cnt[2], rate: n ? cnt[0] / n : null };
  }
  // 体重の判定と食事を合わせた、トレーナー向けのひとこと
  function mealAdvice(j, ms) {
    if (!ms || ms.n < 5) return ms && ms.n ? `食事の振り返りが少なめです（${ms.span}日中${ms.n}日）` : '食事の振り返りがまだありません';
    const rateTxt = `食事は${ms.n}日中${ms.ok}日 設定どおり`;
    if (j.level === 'follow' || j.level === 'slow') {
      if (j.why && j.why.includes('速すぎ')) return `${rateTxt}。食べる量が少なすぎないか確認を`;
      if (ms.over >= 3) return `${rateTxt}。かなりオーバーの日が${ms.over}日あるので、食事の声かけを`;
      if (ms.rate >= 0.7) return `${rateTxt}。守れているので、設定カロリーの見直しを`;
      if (ms.rate < 0.5) return `${rateTxt}。食事の声かけを`;
      return `${rateTxt}。食事と量の両方を確認`;
    }
    return rateTxt;
  }

  window.WP = { MIN_DAYS, DAY, ymd, parse, md, WD, fmt, signed, cls, esc, weeks, forecast, renderStats, createChart, renderWeeks, goalHtml, tdeeOf, kcalPlan, judge, badge, pfc, mealExamples, pfcHtml, MEAL_LABELS, mealStats, mealAdvice };
})();
