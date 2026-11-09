// Фотоальбом: снимки из игры хранятся в IndexedDB этого браузера.
const DB = 'citysim-album';

interface Photo { id: number; t: string; caption: string; data: string }

function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (e) {
      rej(e);
    }
  });
}

export class Album {
  el: HTMLElement;
  private mem: Photo[] = []; // если IndexedDB недоступна
  constructor(private click: () => void) {
    this.el = document.createElement('div');
    this.el.className = 'album-wrap';
    this.el.hidden = true;
    document.getElementById('app')!.append(this.el);
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
  }

  async save(data: string, caption: string) {
    const p = { t: new Date().toISOString(), caption, data } as Photo;
    try {
      const d = await db();
      await new Promise<void>((res, rej) => {
        const tx = d.transaction('photos', 'readwrite');
        tx.objectStore('photos').add(p);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    } catch {
      p.id = Date.now();
      this.mem.unshift(p);
    }
  }

  private async list(): Promise<Photo[]> {
    try {
      const d = await db();
      return await new Promise((res, rej) => {
        const r = d.transaction('photos').objectStore('photos').getAll();
        r.onsuccess = () => res((r.result as Photo[]).reverse());
        r.onerror = () => rej(r.error);
      });
    } catch {
      return this.mem;
    }
  }

  private async remove(id: number) {
    try {
      const d = await db();
      d.transaction('photos', 'readwrite').objectStore('photos').delete(id);
    } catch {
      this.mem = this.mem.filter((p) => p.id !== id);
    }
  }

  async open() {
    this.el.hidden = false;
    const photos = await this.list();
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    this.el.innerHTML = `<div class="album"><div class="am-head"><b>🖼 Альбом воспоминаний</b><span>${photos.length} снимков</span><button class="am-close">✕</button></div>
      ${photos.length ? `<div class="al-grid">${photos.map((p) => `<figure data-id="${p.id}"><img src="${p.data}" alt="${esc(p.caption)}"><figcaption>${esc(p.caption)}</figcaption></figure>`).join('')}</div>` : '<p class="hint">Пока пусто. Нажми 📷, чтобы сделать снимок.</p>'}
      <div class="al-view" hidden></div></div>`;
    this.el.querySelector<HTMLElement>('.am-close')!.onclick = () => { this.click(); this.close(); };
    const view = this.el.querySelector<HTMLElement>('.al-view')!;
    this.el.querySelectorAll<HTMLElement>('figure').forEach((f) => {
      f.onclick = () => {
        const p = photos.find((x) => x.id === Number(f.dataset.id))!;
        view.hidden = false;
        view.innerHTML = `<img src="${p.data}" alt=""><p>${esc(p.caption)}</p><div class="pp-actions"><button class="btn ghost" id="al-del">🗑 Удалить</button><button class="btn" id="al-back">Назад</button></div>`;
        view.querySelector<HTMLElement>('#al-back')!.onclick = () => { view.hidden = true; };
        view.querySelector<HTMLElement>('#al-del')!.onclick = async () => { await this.remove(p.id); this.open(); };
      };
    });
  }

  close() {
    this.el.hidden = true;
  }
}
