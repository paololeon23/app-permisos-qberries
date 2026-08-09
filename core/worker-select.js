/**
 * Select/search custom para trabajadores — UX móvil
 */
window.AV = window.AV || {};

AV.WorkerSelect = class WorkerSelect {
  /**
   * @param {HTMLElement} root
   * @param {{ onSelect: (w)=>void, placeholder?: string }} opts
   */
  constructor(root, opts = {}) {
    this.root = root;
    this.onSelect = opts.onSelect || (() => {});
    this.placeholder = opts.placeholder || 'Buscar por DNI o nombre…';
    this.open = false;
    this.items = [];
    this._render();
    this._bind();
  }

  _render() {
    this.root.classList.add('avs-root');
    this.root.innerHTML = `
      <button type="button" class="avs-trigger" aria-haspopup="listbox" aria-expanded="false">
        <span class="avs-icon" data-lucide="search"></span>
        <span class="avs-value is-placeholder">${AV.escape(this.placeholder)}</span>
        <span class="avs-chevron" data-lucide="chevron-down"></span>
      </button>
      <div class="avs-panel" hidden>
        <div class="avs-search-wrap">
          <input type="search" class="avs-input" placeholder="${AV.escape(this.placeholder)}" autocomplete="off" enterkeyhint="search" />
        </div>
        <ul class="avs-list" role="listbox"></ul>
        <div class="avs-empty" hidden>Sin resultados en catálogo offline</div>
      </div>
    `;
    this.trigger = this.root.querySelector('.avs-trigger');
    this.valueEl = this.root.querySelector('.avs-value');
    this.panel = this.root.querySelector('.avs-panel');
    this.input = this.root.querySelector('.avs-input');
    this.list = this.root.querySelector('.avs-list');
    this.empty = this.root.querySelector('.avs-empty');
    if (window.lucide) lucide.createIcons({ nodes: [this.root] });
  }

  _bind() {
    this.trigger.addEventListener('click', () => this.toggle(true));
    this.input.addEventListener(
      'input',
      AV.debounce(() => this.refresh(this.input.value), 120)
    );
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.toggle(false);
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = this.list.querySelector('.avs-item');
        if (first) first.click();
      }
    });
    document.addEventListener('click', (e) => {
      if (!this.root.contains(e.target)) this.toggle(false);
    });
  }

  toggle(force) {
    this.open = force == null ? !this.open : !!force;
    this.panel.hidden = !this.open;
    this.trigger.setAttribute('aria-expanded', String(this.open));
    this.root.classList.toggle('is-open', this.open);
    if (this.open) {
      this.refresh(this.input.value);
      setTimeout(() => this.input.focus(), 30);
    }
  }

  refresh(q) {
    this.items = AV.workers.search(q, 50);
    this.list.innerHTML = '';
    this.empty.hidden = this.items.length > 0;
    this.items.forEach((w) => {
      const li = document.createElement('li');
      li.className = 'avs-item';
      li.setAttribute('role', 'option');
      li.innerHTML = `
        <div class="avs-item-main">
          <strong>${AV.escape(w.nombres || '—')}</strong>
          <span class="avs-dni">DNI ${AV.escape(w.dni)}</span>
        </div>
        <div class="avs-item-meta">${AV.escape(w.cargo || '')}${w.area ? ' · ' + AV.escape(w.area) : ''}</div>
      `;
      li.addEventListener('click', () => this.select(w));
      this.list.appendChild(li);
    });
  }

  select(w) {
    this.valueEl.textContent = `${w.nombres} · ${w.dni}`;
    this.valueEl.classList.remove('is-placeholder');
    this.toggle(false);
    this.onSelect(w);
  }

  setDisplay(text) {
    if (!text) {
      this.valueEl.textContent = this.placeholder;
      this.valueEl.classList.add('is-placeholder');
      return;
    }
    this.valueEl.textContent = text;
    this.valueEl.classList.remove('is-placeholder');
  }

  clear() {
    this.input.value = '';
    this.setDisplay('');
  }
};
