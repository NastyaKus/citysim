// Газета «Наш город»: окно с номером, архив, кликабельные имена.
import type { Sim } from '../sim/sim';
import type { Issue } from '../sim/newspaper';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
/** [[id|Имя]] → ссылка */
function rich(t: string) {
  return esc(t).replace(/\[\[(\d+)\|([^\]]+)\]\]/g, (_, id, name) => `<a class="pp-name" data-cit="${id}">${name}</a>`);
}

export class PaperView {
  el: HTMLElement;
  private idx = 0;
  constructor(private sim: Sim, private openCard: (id: number) => void, private click: () => void) {
    this.el = document.createElement('div');
    this.el.className = 'paper-wrap';
    this.el.hidden = true;
    document.getElementById('app')!.append(this.el);
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
  }

  open(i = 0) {
    this.idx = i;
    this.sim.paper.unread = false;
    this.el.hidden = false;
    this.render();
  }

  close() {
    this.el.hidden = true;
  }

  private render() {
    const issues = this.sim.paper.issues;
    if (!issues.length) {
      this.el.innerHTML = `<div class="paper"><div class="pp-mast"><span>Наш город</span></div><p class="pp-empty">Свежий номер выходит раз в семь игровых дней. Первый ещё готовится — но можно выпустить экстренный выпуск по горячим следам.</p><div class="pp-actions"><button class="btn" id="pp-extra">🗞️ Экстренный выпуск</button><button class="btn ghost" id="pp-close">Закрыть</button></div></div>`;
      this.bind();
      return;
    }
    const is: Issue = issues[this.idx];
    const left = is.articles.filter((_, i) => i % 2 === 0), right = is.articles.filter((_, i) => i % 2 === 1);
    const art = (a: Issue['articles'][number]) => `<article><div class="pp-sec">${esc(a.section)}</div><h3>${rich(a.title)}</h3><p>${rich(a.body)}</p></article>`;
    this.el.innerHTML = `<div class="paper">
      <div class="pp-top"><span>№ ${is.no}</span><span>${esc(is.title)}</span><span>цена 5₽</span></div>
      <div class="pp-mast"><span>Наш город</span></div>
      <div class="pp-sub">еженедельная газета обо всём, что случилось с нами</div>
      <article class="pp-head"><div class="pp-sec">Главное</div><h2>${rich(is.headline.title)}</h2><p>${rich(is.headline.body)}</p></article>
      <div class="pp-nums">${is.numbers.map(([k, v]) => `<div><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('')}</div>
      <div class="pp-cols"><div>${left.map(art).join('')}</div><div>${right.map(art).join('')}</div></div>
      ${is.ads.length ? `<div class="pp-ads"><div class="pp-sec">Частные объявления</div>${is.ads.map((a) => `<p>${rich(a)}</p>`).join('')}</div>` : ''}
      <div class="pp-actions">
        <button class="btn ghost" id="pp-prev" ${this.idx >= issues.length - 1 ? 'disabled' : ''}>← предыдущий</button>
        <button class="btn ghost" id="pp-next" ${this.idx <= 0 ? 'disabled' : ''}>следующий →</button>
        <button class="btn ghost" id="pp-extra">🗞️ Экстренный</button>
        <button class="btn" id="pp-close">Закрыть</button>
      </div></div>`;
    this.bind();
  }

  private bind() {
    const q = (id: string) => this.el.querySelector<HTMLButtonElement>(id);
    q('#pp-close')!.onclick = () => { this.click(); this.close(); };
    const ex = q('#pp-extra');
    if (ex) ex.onclick = () => { this.click(); this.sim.paper.publish(true); this.open(0); };
    const pr = q('#pp-prev'), nx = q('#pp-next');
    if (pr) pr.onclick = () => { this.click(); this.idx++; this.render(); };
    if (nx) nx.onclick = () => { this.click(); this.idx--; this.render(); };
    this.el.querySelectorAll<HTMLElement>('[data-cit]').forEach((a) => (a.onclick = () => { this.click(); this.close(); this.openCard(Number(a.dataset.cit)); }));
  }
}
