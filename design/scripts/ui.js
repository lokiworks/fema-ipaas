const layerStack = [];

function useLayer(open, onClose) {
  const idRef = useRef(uid('layer'));
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const id = idRef.current;
    layerStack.push(id);
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
      if (layerStack[layerStack.length - 1] !== id) return;
      e.stopPropagation();
      closeRef.current && closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = layerStack.indexOf(id);
      if (i >= 0) layerStack.splice(i, 1);
    };
  }, [open]);
  return useCallback(() => layerStack[layerStack.length - 1] === idRef.current, []);
}

function useFocusReturn(open, containerRef) {
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const t = requestAnimationFrame(() => {
      const el = containerRef.current;
      if (!el || el.contains(document.activeElement)) return;
      const target = el.querySelector('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])') || el;
      target.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(t);
      if (previous && previous.focus && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [open]);
}

function trapTab(e) {
  if (e.key !== 'Tab') return;
  const items = [...e.currentTarget.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function Button({
  variant = 'outline', size = 'md', icon, iconRight, loading, disabled, onClick, children,
  className, title, type = 'button', block, active, ...rest
}) {
  return html`<button
    type=${type}
    title=${title}
    className=${cx('btn', `btn-${variant}`, `btn-${size}`, !children && 'btn-icon', block && 'btn-block', active && 'is-active', className)}
    disabled=${disabled || loading}
    onClick=${onClick}
    ...${rest}
  >
    ${loading ? html`<${Icon} name="LoaderCircle" size=${size === 'xs' ? 12 : 14} className="spin" />` : icon && html`<${Icon} name=${icon} size=${size === 'xs' || size === 'sm' ? 14 : 16} />`}
    ${children != null && children !== false && html`<span className="btn-label">${children}</span>`}
    ${iconRight && html`<${Icon} name=${iconRight} size=${14} className="btn-icon-right" />`}
  </button>`;
}

function IconButton({ icon, onClick, title, size = 'md', variant = 'ghost', className, active, disabled, iconSize }) {
  const btn = html`<button
    type="button"
    aria-label=${title}
    className=${cx('icon-btn', `icon-btn-${size}`, `icon-btn-${variant}`, active && 'is-active', className)}
    onClick=${onClick}
    disabled=${disabled}
  ><${Icon} name=${icon} size=${iconSize || (size === 'sm' ? 14 : 16)} /></button>`;
  return title ? html`<${Tooltip} content=${title}>${btn}<//>` : btn;
}

function Input({
  value, onChange, placeholder, icon, suffix, prefix, size = 'md', disabled, invalid, autoFocus,
  onKeyDown, onBlur, onFocus, type = 'text', className, allowClear, inputRef, readOnly, mono, style,
}) {
  return html`<div className=${cx('input', `input-${size}`, invalid && 'is-invalid', disabled && 'is-disabled', readOnly && 'is-readonly', className)} style=${style}>
    ${icon && html`<${Icon} name=${icon} size=${14} className="input-icon" />`}
    ${prefix && html`<span className="input-affix">${prefix}</span>`}
    <input
      ref=${inputRef}
      type=${type}
      value=${value ?? ''}
      placeholder=${placeholder}
      disabled=${disabled}
      readOnly=${readOnly}
      autoFocus=${autoFocus}
      className=${cx(mono && 'mono')}
      onChange=${(e) => onChange && onChange(e.target.value)}
      onKeyDown=${onKeyDown}
      onBlur=${onBlur}
      onFocus=${onFocus}
    />
    ${allowClear && value ? html`<button type="button" className="input-clear" onClick=${() => onChange('')} aria-label="清除"><${Icon} name="CircleX" size=${14} /></button>` : null}
    ${suffix && html`<span className="input-affix">${suffix}</span>`}
  </div>`;
}

function SearchInput({ value, onChange, placeholder = '搜索', width = 240, size = 'md' }) {
  return html`<${Input} icon="Search" value=${value} onChange=${onChange} placeholder=${placeholder} allowClear size=${size} style=${{ width }} />`;
}

function Textarea({ value, onChange, placeholder, rows = 3, disabled, readOnly, mono, className, autoFocus, invalid }) {
  return html`<textarea
    className=${cx('textarea', mono && 'mono', invalid && 'is-invalid', className)}
    value=${value ?? ''}
    rows=${rows}
    placeholder=${placeholder}
    disabled=${disabled}
    readOnly=${readOnly}
    autoFocus=${autoFocus}
    onChange=${(e) => onChange && onChange(e.target.value)}
  />`;
}

function Floating({ anchorRef, open, onClose, placement = 'bottom-start', offset = 6, children, className, style, matchWidth }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const isTop = useLayer(open, onClose);
  useLayoutEffect(() => {
    if (!open) { setPos(null); return undefined; }
    const update = () => {
      const anchor = anchorRef.current;
      const el = ref.current;
      if (!anchor || !el) return;
      const a = anchor.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const parts = placement.split('-');
      let side = parts[0];
      const align = parts[1];
      let top;
      let left;
      if (side === 'bottom' || side === 'top') {
        if (side === 'bottom' && a.bottom + offset + h > vh - 8 && a.top - offset - h > 8) side = 'top';
        else if (side === 'top' && a.top - offset - h < 8) side = 'bottom';
        top = side === 'bottom' ? a.bottom + offset : a.top - offset - h;
        left = align === 'end' ? a.right - w : align === 'start' ? a.left : a.left + a.width / 2 - w / 2;
      } else {
        if (side === 'right' && a.right + offset + w > vw - 8) side = 'left';
        else if (side === 'left' && a.left - offset - w < 8) side = 'right';
        left = side === 'right' ? a.right + offset : a.left - offset - w;
        top = align === 'end' ? a.bottom - h : align === 'start' ? a.top : a.top + a.height / 2 - h / 2;
      }
      setPos({
        top: Math.max(8, Math.min(top, vh - h - 8)),
        left: Math.max(8, Math.min(left, vw - w - 8)),
        side,
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(ref.current);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, placement]);
  useEffect(() => {
    if (!open) return undefined;
    const listener = (e) => {
      if (!isTop()) return;
      if (ref.current && ref.current.contains(e.target)) return;
      if (anchorRef.current && anchorRef.current.contains(e.target)) return;
      const other = e.target.closest && e.target.closest('.floating, .modal, .drawer');
      if (other && other !== ref.current && isLaterLayer(other, ref.current)) return;
      onClose && onClose();
    };
    const t = setTimeout(() => document.addEventListener('mousedown', listener), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', listener); };
  }, [open, onClose]);
  if (!open) return null;
  const minWidth = matchWidth && anchorRef.current ? anchorRef.current.offsetWidth : undefined;
  return html`<${Portal}>
    <div
      ref=${ref}
      className=${cx('floating', className, pos && `side-${pos.side}`)}
      style=${{ position: 'fixed', top: pos ? pos.top : -9999, left: pos ? pos.left : -9999, minWidth, visibility: pos ? 'visible' : 'hidden', ...style }}
    >${children}</div>
  <//>`;
}

function isLaterLayer(other, mine) {
  if (!mine) return true;
  return Boolean(mine.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING);
}

function Popover({ trigger, children, placement = 'bottom-start', width, className, open: openProp, onOpenChange, offset }) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (v) => { setOpenState(v); onOpenChange && onOpenChange(v); };
  const anchorRef = useRef(null);
  const close = useCallback(() => setOpen(false), [onOpenChange]);
  return html`<${Fragment}>
    <span ref=${anchorRef} className="popover-anchor" onClick=${() => setOpen(!open)}>${trigger}</span>
    <${Floating} anchorRef=${anchorRef} open=${open} onClose=${close} placement=${placement} offset=${offset} className=${cx('popover', className)} style=${{ width }}>
      ${typeof children === 'function' ? children({ close }) : children}
    <//>
  <//>`;
}

function menuKeyNav(e) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  const items = [...e.currentTarget.querySelectorAll('[role="menuitem"]:not([disabled])')];
  if (!items.length) return;
  e.preventDefault();
  const i = items.indexOf(document.activeElement);
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
  items[next].focus();
}

function Menu({ items, onSelect, close }) {
  return html`<div className="menu" role="menu" onKeyDown=${menuKeyNav}>
    ${items.filter(Boolean).map((item, i) => {
      if (item.divider) return html`<div key=${`d${i}`} className="menu-divider" />`;
      if (item.group) return html`<div key=${`g${i}`} className="menu-group">${item.group}</div>`;
      return html`<button
        key=${item.key || `${i}-${typeof item.label === 'string' ? item.label : ''}`}
        type="button"
        role="menuitem"
        className=${cx('menu-item', item.danger && 'is-danger', item.disabled && 'is-disabled', item.active && 'is-active')}
        disabled=${item.disabled}
        onClick=${() => { close && close(); item.onClick && item.onClick(); onSelect && onSelect(item); }}
      >
        ${item.icon ? html`<${Icon} name=${item.icon} size=${16} />` : item.iconNode}
        <span className="menu-item-body">
          <span className="menu-item-label">${item.label}</span>
          ${item.desc && html`<span className="menu-item-desc">${item.desc}</span>`}
        </span>
        ${item.shortcut && html`<span className="menu-item-shortcut">${item.shortcut}</span>`}
        ${item.active && html`<${Icon} name="Check" size=${14} className="menu-item-check" />`}
      </button>`;
    })}
  </div>`;
}

function Dropdown({ trigger, items, placement = 'bottom-end', width = 180, onSelect }) {
  return html`<${Popover} trigger=${trigger} placement=${placement} width=${width} className="dropdown">
    ${({ close }) => html`<${Menu} items=${items} close=${close} onSelect=${onSelect} />`}
  <//>`;
}

function MoreMenu({ items, size = 'sm', icon = 'Ellipsis', placement = 'bottom-end', width = 168 }) {
  return html`<span onClick=${(e) => e.stopPropagation()}>
    <${Dropdown}
      trigger=${html`<button type="button" className=${cx('icon-btn', `icon-btn-${size}`, 'icon-btn-ghost')} aria-label="更多操作"><${Icon} name=${icon} size=${16} /></button>`}
      items=${items}
      placement=${placement}
      width=${width}
    />
  </span>`;
}

function Select({
  value, onChange, options, placeholder = '请选择', size = 'md', width, searchable, disabled,
  multiple, renderValue, className, invalid, clearable, dropdownWidth, placement = 'bottom-start', footer,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(-1);
  const anchorRef = useRef(null);
  const close = useCallback(() => { setOpen(false); setQ(''); setFocus(-1); }, []);
  const values = multiple ? (value || []) : [value];
  const selected = options.filter((o) => !o.group && values.includes(o.value));
  const filtered = q ? options.filter((o) => !o.group && `${o.label}${o.desc || ''}`.toLowerCase().includes(q.toLowerCase())) : options;
  const pickable = filtered.filter((o) => !o.group && !o.disabled);
  const pick = (o) => {
    if (multiple) {
      const next = values.includes(o.value) ? values.filter((v) => v !== o.value) : [...values, o.value];
      onChange(next);
    } else {
      onChange(o.value);
      close();
      if (anchorRef.current) anchorRef.current.focus();
    }
  };
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocus((f) => {
          const n = pickable.length;
          if (!n) return -1;
          return e.key === 'ArrowDown' ? (f + 1) % n : (f - 1 + n) % n;
        });
      } else if (e.key === 'Enter' && focus >= 0 && pickable[focus]) {
        e.preventDefault();
        pick(pickable[focus]);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  const display = renderValue
    ? renderValue(selected)
    : multiple
      ? selected.length
        ? html`<span className="select-tags">${selected.map((o) => html`<span key=${o.value} className="select-tag">${o.label}<span role="button" aria-label=${`移除 ${o.label}`} className="select-tag-x" onClick=${(e) => { e.stopPropagation(); if (!disabled) pick(o); }}><${Icon} name="X" size=${10} /></span></span>`)}</span>`
        : null
      : selected[0] && html`<span className="select-value">${selected[0].icon && html`<${Icon} name=${selected[0].icon} size=${14} />`}${selected[0].iconNode}${selected[0].label}</span>`;
  return html`<${Fragment}>
    <button
      ref=${anchorRef}
      type="button"
      disabled=${disabled}
      className=${cx('select', `input-${size}`, open && 'is-open', invalid && 'is-invalid', className)}
      style=${{ width }}
      onClick=${() => setOpen(!open)}
      onKeyDown=${(e) => { if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setOpen(true); } }}
      aria-haspopup="listbox"
      aria-expanded=${open}
    >
      ${display || html`<span className="select-placeholder">${placeholder}</span>`}
      ${clearable && selected.length ? html`<span className="select-clear" onClick=${(e) => { e.stopPropagation(); onChange(multiple ? [] : null); }}><${Icon} name="CircleX" size=${14} /></span>` : null}
      <${Icon} name="ChevronDown" size=${14} className="select-caret" />
    </button>
    <${Floating} anchorRef=${anchorRef} open=${open} onClose=${close} placement=${placement} matchWidth className="popover select-pop" style=${{ width: dropdownWidth }}>
      ${searchable && html`<div className="select-search"><${Input} icon="Search" size="sm" value=${q} onChange=${setQ} placeholder="搜索" autoFocus /></div>`}
      <div className="select-options">
        ${filtered.length === 0 && html`<div className="select-empty">无匹配结果</div>`}
        ${filtered.map((o) => o.group
          ? html`<div key=${`g-${o.group}`} className="menu-group">${o.group}</div>`
          : html`<button
            key=${o.value}
            type="button"
            role="option"
            aria-selected=${values.includes(o.value)}
            className=${cx('menu-item', values.includes(o.value) && 'is-active', o.disabled && 'is-disabled', pickable[focus] === o && 'is-focus')}
            disabled=${o.disabled}
            onClick=${() => pick(o)}
          >
            ${multiple && html`<span className=${cx('checkbox-box', values.includes(o.value) && 'is-checked')}>${values.includes(o.value) && html`<${Icon} name="Check" size=${12} strokeWidth=${3} />`}</span>`}
            ${o.icon && html`<${Icon} name=${o.icon} size=${16} />`}
            ${o.iconNode}
            <span className="menu-item-body">
              <span className="menu-item-label">${o.label}</span>
              ${o.desc && html`<span className="menu-item-desc">${o.desc}</span>`}
            </span>
            ${!multiple && values.includes(o.value) && html`<${Icon} name="Check" size=${14} className="menu-item-check" />`}
          </button>`)}
      </div>
      ${footer && html`<div className="select-footer" onClick=${close}>${footer}</div>`}
    <//>
  <//>`;
}

function Checkbox({ checked, onChange, indeterminate, label, disabled, className }) {
  return html`<label className=${cx('checkbox', disabled && 'is-disabled', className)} onClick=${(e) => e.stopPropagation()}>
    <input type="checkbox" checked=${Boolean(checked)} disabled=${disabled} onChange=${(e) => onChange && onChange(e.target.checked)} />
    <span className=${cx('checkbox-box', (checked || indeterminate) && 'is-checked')}>
      ${indeterminate ? html`<${Icon} name="Minus" size=${12} strokeWidth=${3} />` : checked && html`<${Icon} name="Check" size=${12} strokeWidth=${3} />`}
    </span>
    ${label && html`<span className="checkbox-label">${label}</span>`}
  </label>`;
}

function Radio({ checked, onChange, label, disabled }) {
  return html`<label className=${cx('radio', disabled && 'is-disabled')}>
    <input type="radio" checked=${Boolean(checked)} disabled=${disabled} onChange=${() => onChange && onChange()} />
    <span className=${cx('radio-dot', checked && 'is-checked')} />
    ${label && html`<span>${label}</span>`}
  </label>`;
}

function RadioGroup({ value, onChange, options, direction = 'row', disabled }) {
  return html`<div className=${cx('radio-group', `radio-group-${direction}`)}>
    ${options.map((o) => html`<${Radio} key=${o.value} checked=${value === o.value} onChange=${() => onChange(o.value)} label=${o.label} disabled=${disabled || o.disabled} />`)}
  </div>`;
}

function RadioCards({ value, onChange, options, columns = 2, disabled }) {
  return html`<div className="radio-cards" style=${{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
    ${options.map((o) => html`<button
      key=${o.value}
      type="button"
      className=${cx('radio-card', value === o.value && 'is-active', (o.disabled || (disabled && value !== o.value)) && 'is-disabled')}
      disabled=${o.disabled || (disabled && value !== o.value)}
      onClick=${() => !disabled && onChange(o.value)}
    >
      ${o.icon && html`<span className="radio-card-icon"><${Icon} name=${o.icon} size=${18} /></span>`}
      <span className="radio-card-body">
        <span className="radio-card-title">${o.label}</span>
        ${o.desc && html`<span className="radio-card-desc">${o.desc}</span>`}
      </span>
    </button>`)}
  </div>`;
}

function Switch({ checked, onChange, size = 'md', disabled, loading }) {
  return html`<button
    type="button"
    role="switch"
    aria-checked=${Boolean(checked)}
    disabled=${disabled || loading}
    className=${cx('switch', `switch-${size}`, checked && 'is-checked')}
    onClick=${(e) => { e.stopPropagation(); onChange && onChange(!checked); }}
  ><span className="switch-thumb">${loading && html`<${Icon} name="LoaderCircle" size=${10} className="spin" />`}</span></button>`;
}

function Segmented({ value, onChange, options, size = 'md', disabled }) {
  return html`<div className=${cx('segmented', `segmented-${size}`, disabled && 'is-disabled')}>
    ${options.map((o) => html`<button
      key=${o.value}
      type="button"
      disabled=${disabled && value !== o.value}
      className=${cx('segmented-item', value === o.value && 'is-active')}
      onClick=${() => !disabled && onChange(o.value)}
      title=${o.title}
    >${o.icon && html`<${Icon} name=${o.icon} size=${14} />`}${o.label}</button>`)}
  </div>`;
}

function Tabs({ value, onChange, items, variant = 'line', className, extra }) {
  return html`<div className=${cx('tabs', `tabs-${variant}`, className)} role="tablist">
    ${items.map((it) => html`<button
      key=${it.value}
      type="button"
      role="tab"
      aria-selected=${value === it.value}
      className=${cx('tab', value === it.value && 'is-active')}
      onClick=${() => onChange(it.value)}
    >
      ${it.icon && html`<${Icon} name=${it.icon} size=${14} />`}
      ${it.label}
      ${it.count != null && html`<span className="tab-count">${it.count}</span>`}
      ${it.dot && html`<span className=${cx('tab-dot', it.dotTone === 'warning' && 'is-warning')} />`}
    </button>`)}
    ${extra && html`<div className="tabs-extra">${extra}</div>`}
  </div>`;
}

function Tag({ tone = 'default', dot, icon, children, size = 'md', className, onClose, title }) {
  return html`<span className=${cx('tag', `tag-${tone}`, `tag-${size}`, className)} title=${title}>
    ${dot && html`<span className="tag-dot" />`}
    ${icon && html`<${Icon} name=${icon} size=${12} />`}
    ${children}
    ${onClose && html`<button type="button" className="tag-close" onClick=${onClose} aria-label="移除"><${Icon} name="X" size=${10} /></button>`}
  </span>`;
}

const AVATAR_COLORS = ['#8142E3', '#2563EB', '#0891B2', '#059669', '#D97706', '#DC2626', '#DB2777', '#4F46E5', '#65A30D', '#0D9488'];

function Avatar({ name = '', size = 24, color, src, square, className }) {
  const bg = color || AVATAR_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  const initials = /[一-龥]/.test(name) ? name.slice(size < 28 ? -1 : -2) : name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  return html`<span
    className=${cx('avatar', square && 'is-square', className)}
    style=${{ width: size, height: size, background: src ? undefined : bg, fontSize: Math.max(10, Math.round(size * 0.38)) }}
    title=${name}
  >${src ? html`<img src=${src} alt=${name} />` : initials}</span>`;
}

function AvatarGroup({ names, size = 22, max = 3 }) {
  const shown = names.slice(0, max);
  return html`<span className="avatar-group">
    ${shown.map((n, i) => html`<span key=${i} style=${{ transform: `translateX(${-i * 5}px)`, display: 'inline-flex' }}><${Avatar} name=${n} size=${size} /></span>`)}
    ${names.length > max && html`<span className="avatar avatar-more" style=${{ width: size, height: size, transform: `translateX(${-shown.length * 5}px)` }}>+${names.length - max}</span>`}
  </span>`;
}

function Tooltip({ content, children, placement = 'top', delay = 400 }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!content) return children;
  const show = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(true), delay); };
  const hide = () => { clearTimeout(timer.current); setOpen(false); };
  return html`<${Fragment}>
    <span ref=${ref} className="tooltip-anchor" onMouseEnter=${show} onMouseLeave=${hide} onMouseDown=${hide} onFocus=${(e) => { if (e.target.matches(':focus-visible')) show(); }} onBlur=${hide}>${children}</span>
    ${open && html`<${TooltipBubble} anchorRef=${ref} placement=${placement}>${content}<//>`}
  <//>`;
}

function TooltipBubble({ anchorRef, placement, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!anchorRef.current || !ref.current) return;
    const a = anchorRef.current.getBoundingClientRect();
    const el = ref.current;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let top = placement === 'bottom' ? a.bottom + 6 : a.top - h - 6;
    let left = a.left + a.width / 2 - w / 2;
    if (placement === 'right') { top = a.top + a.height / 2 - h / 2; left = a.right + 6; }
    if (placement === 'left') { top = a.top + a.height / 2 - h / 2; left = a.left - w - 6; }
    if (top < 4) top = a.bottom + 6;
    setPos({ top, left: Math.max(4, Math.min(left, window.innerWidth - w - 4)) });
  }, []);
  return html`<${Portal}><div ref=${ref} className="tooltip" style=${{ top: pos ? pos.top : -9999, left: pos ? pos.left : -9999 }}>${children}</div><//>`;
}

function Modal({ open, onClose, title, description, width = 520, footer, children, className, bodyClassName, maskClosable = true, icon }) {
  const isTop = useLayer(open, onClose);
  const boxRef = useRef(null);
  useFocusReturn(open, boxRef);
  if (!open) return null;
  return html`<${Portal}>
    <div className="overlay" onMouseDown=${(e) => { if (maskClosable && e.target === e.currentTarget && isTop()) onClose && onClose(); }}>
      <div ref=${boxRef} tabIndex=${-1} onKeyDown=${trapTab} className=${cx('modal', className)} style=${{ width }} role="dialog" aria-modal="true" aria-label=${typeof title === 'string' ? title : undefined}>
        ${title && html`<div className="modal-header">
          ${icon}
          <div className="modal-heading">
            <div className="modal-title">${title}</div>
            ${description && html`<div className="modal-desc">${description}</div>`}
          </div>
          <${IconButton} icon="X" size="sm" onClick=${onClose} title="关闭" />
        </div>`}
        <div className=${cx('modal-body', bodyClassName)}>${children}</div>
        ${footer && html`<div className="modal-footer">${footer}</div>`}
      </div>
    </div>
  <//>`;
}

function Drawer({ open, onClose, title, width = 560, footer, children, extra, className, bodyClassName, subtitle, mask = true, icon }) {
  const [visible, setVisible] = useState(open);
  const [entered, setEntered] = useState(false);
  const isTop = useLayer(open, onClose);
  const boxRef = useRef(null);
  useFocusReturn(open, boxRef);
  useEffect(() => {
    if (open) {
      setVisible(true);
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
      return () => cancelAnimationFrame(r);
    }
    setEntered(false);
    const t = setTimeout(() => setVisible(false), 200);
    return () => clearTimeout(t);
  }, [open]);
  if (!visible) return null;
  return html`<${Portal}>
    <div className=${cx('drawer-root', entered && 'is-entered', !mask && 'no-mask')}>
      ${mask && html`<div className="drawer-mask" onMouseDown=${() => { if (open && isTop()) onClose(); }} />`}
      <aside ref=${boxRef} tabIndex=${-1} className=${cx('drawer', className)} style=${{ width }} role="dialog" aria-label=${typeof title === 'string' ? title : undefined}>
        <div className="drawer-header">
          ${icon}
          <div className="drawer-heading">
            <div className="drawer-title">${title}</div>
            ${subtitle && html`<div className="drawer-subtitle">${subtitle}</div>`}
          </div>
          ${extra}
          <${IconButton} icon="X" size="sm" onClick=${onClose} title="关闭" />
        </div>
        <div className=${cx('drawer-body', bodyClassName)}>${children}</div>
        ${footer && html`<div className="drawer-footer">${footer}</div>`}
      </aside>
    </div>
  <//>`;
}

const toastBus = { listeners: new Set(), items: [] };

function pushToast(type, content, duration = 2400) {
  const item = { id: uid('t'), type, content };
  toastBus.items = [...toastBus.items.slice(-3), item];
  toastBus.listeners.forEach((l) => l());
  setTimeout(() => {
    toastBus.items = toastBus.items.filter((t) => t.id !== item.id);
    toastBus.listeners.forEach((l) => l());
  }, duration);
}

const toast = {
  success: (c) => pushToast('success', c),
  error: (c) => pushToast('error', c, 3200),
  info: (c) => pushToast('info', c),
  warning: (c) => pushToast('warning', c, 3000),
  loading: (c, d = 1200) => pushToast('loading', c, d),
};

const TOAST_ICON = { success: 'CircleCheck', error: 'CircleX', info: 'Info', warning: 'TriangleAlert', loading: 'LoaderCircle' };

function ToastHost() {
  const items = useSyncExternalStore(
    (l) => { toastBus.listeners.add(l); return () => toastBus.listeners.delete(l); },
    () => toastBus.items,
  );
  return html`<${Portal}><div className="toast-host">
    ${items.map((t) => html`<div key=${t.id} className=${cx('toast', `toast-${t.type}`)}>
      <${Icon} name=${TOAST_ICON[t.type]} size=${16} className=${t.type === 'loading' ? 'spin' : ''} />
      <span>${t.content}</span>
    </div>`)}
  </div><//>`;
}

const confirmBus = { listener: null };

function confirmDialog(opts) {
  return new Promise((resolve) => confirmBus.listener && confirmBus.listener({ ...opts, resolve }));
}

function ConfirmHost() {
  const [state, setState] = useState(null);
  const [typed, setTyped] = useState('');
  useEffect(() => {
    confirmBus.listener = (s) => {
      setTyped('');
      setState((prev) => { if (prev) prev.resolve(false); return s; });
    };
    return () => { confirmBus.listener = null; };
  }, []);
  const done = (v) => { state && state.resolve(v); setState(null); };
  if (!state) return null;
  const blocked = state.confirmText && typed !== state.confirmText;
  return html`<${Modal}
    open=${true}
    onClose=${() => done(false)}
    width=${420}
    className="confirm"
    maskClosable=${false}
    footer=${html`<${Fragment}>
      <${Button} autoFocus=${Boolean(state.danger && !state.confirmText)} onClick=${() => done(false)}>${state.cancelText || '取消'}<//>
      <${Button} autoFocus=${!state.danger && !state.confirmText} variant=${state.danger ? 'danger' : 'primary'} disabled=${blocked} onClick=${() => done(true)}>${state.okText || '确定'}<//>
    <//>`}
  >
    <div className="confirm-body">
      <span className=${cx('confirm-icon', state.danger ? 'is-danger' : 'is-warning')}><${Icon} name=${state.danger ? 'CircleAlert' : 'Info'} size=${20} /></span>
      <div>
        <div className="confirm-title">${state.title}</div>
        ${state.content && html`<div className="confirm-content">${state.content}</div>`}
        ${state.confirmText && html`<div className="confirm-type">
          <div>请输入 <b>${state.confirmText}</b> 以确认</div>
          <${Input} value=${typed} onChange=${setTyped} placeholder=${state.confirmText} autoFocus onKeyDown=${(e) => { if (e.key === 'Enter' && !blocked) done(true); }} />
        </div>`}
      </div>
    </div>
  <//>`;
}

function Empty({ icon = 'Inbox', title, description, action, size = 'md', illustration }) {
  return html`<div className=${cx('empty', `empty-${size}`)}>
    ${illustration || html`<div className="empty-icon"><${Icon} name=${icon} size=${size === 'sm' ? 20 : 28} strokeWidth=${1.5} /></div>`}
    ${title && html`<div className="empty-title">${title}</div>`}
    ${description && html`<div className="empty-desc">${description}</div>`}
    ${action && html`<div className="empty-action">${action}</div>`}
  </div>`;
}

function Table({
  columns, data, rowKey = 'id', onRowClick, selectable, selected = [], onSelect, empty, className,
  rowClassName, sticky = true, dense, loading,
}) {
  const allKeys = data.map((r) => r[rowKey]);
  const allChecked = selectable && data.length > 0 && allKeys.every((k) => selected.includes(k));
  const someChecked = selectable && !allChecked && allKeys.some((k) => selected.includes(k));
  return html`<div className=${cx('table-wrap', className)}>
    <table className=${cx('table', dense && 'is-dense', sticky && 'is-sticky')}>
      <thead>
        <tr>
          ${selectable && html`<th className="col-check"><${Checkbox} checked=${allChecked} indeterminate=${someChecked} onChange=${(v) => onSelect(v ? allKeys : [])} /></th>`}
          ${columns.map((c) => html`<th key=${c.key} style=${{ width: c.width, minWidth: c.width, textAlign: c.align }} className=${c.className}>
            <span className="th-inner">${c.title}${c.help && html`<${Tooltip} content=${c.help}><${Icon} name="CircleHelp" size=${12} /><//>`}${c.sortable && html`<${Icon} name="ArrowUpDown" size=${12} className="th-sort" />`}</span>
          </th>`)}
        </tr>
      </thead>
      <tbody>
        ${loading
          ? [0, 1, 2, 3, 4].map((i) => html`<tr key=${i}>${selectable && html`<td />`}${columns.map((c) => html`<td key=${c.key}><div className="skeleton" style=${{ width: '70%', height: 12 }} /></td>`)}</tr>`)
          : data.map((row, i) => html`<tr
          key=${row[rowKey]}
          className=${cx(onRowClick && 'is-clickable', selected.includes(row[rowKey]) && 'is-selected', rowClassName && rowClassName(row))}
          onClick=${() => onRowClick && onRowClick(row)}
          tabIndex=${onRowClick ? 0 : undefined}
          onKeyDown=${onRowClick ? (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onRowClick(row); } : undefined}
        >
          ${selectable && html`<td className="col-check"><${Checkbox} checked=${selected.includes(row[rowKey])} onChange=${(v) => onSelect(v ? [...selected, row[rowKey]] : selected.filter((k) => k !== row[rowKey]))} /></td>`}
          ${columns.map((c) => html`<td key=${c.key} style=${{ textAlign: c.align }} className=${cx(c.wrap && 'is-wrap', c.className)}>${c.render ? c.render(row, i) : row[c.key]}</td>`)}
        </tr>`)}
      </tbody>
    </table>
    ${!loading && data.length === 0 && (empty || html`<${Empty} title="暂无数据" size="sm" />`)}
  </div>`;
}

function Pagination({ page, pageSize, total, onChange, onPageSizeChange, extra }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const nums = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  return html`<div className="pagination">
    <span className="pagination-total">共 ${total} 条</span>
    <${IconButton} icon="ChevronLeft" size="sm" variant="outline" title="上一页" disabled=${page <= 1} onClick=${() => onChange(page - 1)} />
    ${nums.map((n, i) => n === '…'
      ? html`<span key=${`e${i}`} className="pagination-ellipsis">…</span>`
      : html`<button key=${n} type="button" className=${cx('pagination-item', n === page && 'is-active')} onClick=${() => onChange(n)}>${n}</button>`)}
    <${IconButton} icon="ChevronRight" size="sm" variant="outline" title="下一页" disabled=${page >= pages} onClick=${() => onChange(page + 1)} />
    ${onPageSizeChange && html`<${Select}
      size="sm"
      width=${100}
      value=${pageSize}
      onChange=${onPageSizeChange}
      options=${[10, 20, 50].map((n) => ({ value: n, label: `${n} 条/页` }))}
    />`}
    ${extra}
  </div>`;
}

function Field({ label, required, hint, error, children, extra, help, layout = 'vertical', className }) {
  return html`<div className=${cx('field', `field-${layout}`, error && 'has-error', className)}>
    ${label && html`<div className="field-label">
      <span>${label}${required && html`<span className="field-required">*</span>`}</span>
      ${help && html`<${Tooltip} content=${help}><${Icon} name="CircleHelp" size=${13} className="field-help" /><//>`}
      ${extra && html`<span className="field-extra">${extra}</span>`}
    </div>`}
    <div className="field-control">
      ${children}
      ${error ? html`<div className="field-error">${error}</div>` : hint && html`<div className="field-hint">${hint}</div>`}
    </div>
  </div>`;
}

function Alert({ tone = 'info', title, children, icon, action, onClose, className }) {
  const icons = { info: 'Info', success: 'CircleCheck', warning: 'TriangleAlert', danger: 'CircleAlert', primary: 'Sparkles' };
  return html`<div className=${cx('alert', `alert-${tone}`, className)}>
    <${Icon} name=${icon || icons[tone]} size=${16} className="alert-icon" />
    <div className="alert-body">
      ${title && html`<div className="alert-title">${title}</div>`}
      ${children && html`<div className="alert-content">${children}</div>`}
    </div>
    ${action}
    ${onClose && html`<${IconButton} icon="X" size="sm" onClick=${onClose} title="关闭" />`}
  </div>`;
}

function Kbd({ children }) {
  return html`<kbd className="kbd">${children}</kbd>`;
}

function Progress({ value, tone = 'primary', height = 6 }) {
  return html`<div className="progress" style=${{ height }}><div className=${cx('progress-bar', `tone-${tone}`)} style=${{ width: `${Math.min(100, value)}%` }} /></div>`;
}

function Card({ title, extra, children, className, bodyClassName, subtitle, icon, onClick }) {
  return html`<section className=${cx('card', onClick && 'is-clickable', className)} onClick=${onClick}>
    ${(title || extra) && html`<header className="card-header">
      <div className="card-heading">
        ${icon && html`<${Icon} name=${icon} size=${16} />`}
        <div>
          <div className="card-title">${title}</div>
          ${subtitle && html`<div className="card-subtitle">${subtitle}</div>`}
        </div>
      </div>
      ${extra && html`<div className="card-extra">${extra}</div>`}
    </header>`}
    <div className=${cx('card-body', bodyClassName)}>${children}</div>
  </section>`;
}

function Collapse({ title, children, defaultOpen = true, extra, className, icon }) {
  const [open, setOpen] = useState(defaultOpen);
  return html`<div className=${cx('collapse', open && 'is-open', className)}>
    <div className="collapse-header">
      <button type="button" className="collapse-toggle" aria-expanded=${open} onClick=${() => setOpen(!open)}>
        <${Icon} name="ChevronRight" size=${14} className="collapse-caret" />
        ${icon && html`<${Icon} name=${icon} size=${14} />`}
        <span className="collapse-title">${title}</span>
      </button>
      ${extra && html`<span className="collapse-extra">${extra}</span>`}
    </div>
    ${open && html`<div className="collapse-body">${children}</div>`}
  </div>`;
}

function Steps({ current, items, onChange }) {
  return html`<ol className="steps">
    ${items.map((it, i) => html`<li
      key=${it.title}
      className=${cx('step', i < current && 'is-done', i === current && 'is-current')}
      onClick=${() => onChange && onChange(i)}
    >
      <span className="step-index">${i < current ? html`<${Icon} name="Check" size=${12} strokeWidth=${3} />` : i + 1}</span>
      <span className="step-body">
        <span className="step-title">${it.title}</span>
        ${it.desc && html`<span className="step-desc">${it.desc}</span>`}
      </span>
      ${i < items.length - 1 && html`<span className="step-line" />`}
    </li>`)}
  </ol>`;
}

function Breadcrumb({ items }) {
  return html`<nav className="breadcrumb">
    ${items.map((it, i) => html`<${Fragment} key=${i}>
      ${i > 0 && html`<${Icon} name="ChevronRight" size=${12} className="breadcrumb-sep" />`}
      ${it.to ? html`<${Link} to=${it.to}>${it.label}<//>` : html`<span className="breadcrumb-current">${it.label}</span>`}
    <//>`)}
  </nav>`;
}

function PageHeader({ title, description, actions, back, children, tabs, icon }) {
  return html`<div className=${cx('page-header', tabs && 'has-tabs')}>
    <div className="page-header-main">
      ${back && html`<${IconButton} icon="ArrowLeft" onClick=${() => navigate(back)} title="返回" />`}
      ${icon}
      <div className="page-header-text">
        <h1 className="page-title">${title}</h1>
        ${description && html`<p className="page-desc">${description}</p>`}
      </div>
      ${actions && html`<div className="page-actions">${actions}</div>`}
    </div>
    ${children}
    ${tabs}
  </div>`;
}

function Stat({ label, value, delta, tone, suffix, help, icon, onClick, active }) {
  return html`<div
    className=${cx('stat', onClick && 'is-clickable', active && 'is-active')}
    onClick=${onClick}
    role=${onClick ? 'button' : undefined}
    tabIndex=${onClick ? 0 : undefined}
    onKeyDown=${onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
  >
    <div className="stat-label">${icon && html`<${Icon} name=${icon} size=${14} />`}${label}${help && html`<${Tooltip} content=${help}><${Icon} name="CircleHelp" size=${12} /><//>`}</div>
    <div className="stat-value">${value}${suffix && html`<span className="stat-suffix">${suffix}</span>`}</div>
    ${delta && html`<div className=${cx('stat-delta', tone && `tone-${tone}`)}>${delta}</div>`}
  </div>`;
}

function CopyButton({ text, label, size = 'sm' }) {
  const [done, setDone] = useState(false);
  return html`<${Button}
    size=${size}
    variant="ghost"
    icon=${done ? 'Check' : 'Copy'}
    onClick=${(e) => {
      e.stopPropagation();
      if (copyText(text)) { setDone(true); toast.success('已复制到剪贴板'); setTimeout(() => setDone(false), 1500); } else { toast.error('复制失败，请手动选中复制'); }
    }}
  >${label}<//>`;
}

function JsonView({ value, name, depth = 0, defaultExpandDepth = 2, onPick }) {
  const [open, setOpen] = useState(depth < defaultExpandDepth);
  const isObj = value && typeof value === 'object';
  const keyEl = name != null && html`<span className=${cx('json-key', typeof name === 'number' && 'is-index')} onClick=${onPick ? (e) => { e.stopPropagation(); onPick(name, value); } : undefined}>${typeof name === 'number' ? name : `"${name}"`}</span>`;
  if (!isObj) {
    const t = value === null ? 'null' : typeof value;
    const text = t === 'string' ? `"${value}"` : String(value);
    return html`<div className="json-row" style=${{ paddingLeft: depth * 14 }}>
      <span className="json-toggle-space" />${keyEl}${name != null && html`<span className="json-colon">: </span>`}<span className=${`json-${t}`}>${text}</span>
    </div>`;
  }
  const entries = Array.isArray(value) ? value.map((v, i) => [i, v]) : Object.entries(value);
  const brackets = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
  return html`<div className="json-node">
    <div className="json-row is-branch" style=${{ paddingLeft: depth * 14 }} onClick=${() => setOpen(!open)}>
      <${Icon} name=${open ? 'ChevronDown' : 'ChevronRight'} size=${12} className="json-toggle" />
      ${keyEl}${name != null && html`<span className="json-colon">: </span>`}
      <span className="json-bracket">${brackets[0]}</span>
      ${!open && html`<${Fragment}><span className="json-summary">${Array.isArray(value) ? `${entries.length} 项` : `${entries.length} 个字段`}</span><span className="json-bracket">${brackets[1]}</span><//>`}
    </div>
    ${open && entries.map(([k, v]) => html`<${JsonView} key=${k} name=${k} value=${v} depth=${depth + 1} defaultExpandDepth=${defaultExpandDepth} onPick=${onPick} />`)}
    ${open && html`<div className="json-row" style=${{ paddingLeft: depth * 14 }}><span className="json-toggle-space" /><span className="json-bracket">${brackets[1]}</span></div>`}
  </div>`;
}

function CodeBlock({ code, lang, maxHeight, className }) {
  return html`<pre className=${cx('code-block', className)} style=${{ maxHeight }} data-lang=${lang}><code>${code}</code></pre>`;
}

function Dot({ tone = 'default', pulse }) {
  return html`<span className=${cx('status-dot', `tone-${tone}`, pulse && 'is-pulse')} />`;
}

function InlineEdit({ value, onSave, className, placeholder, maxLength = 60, readOnly }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef(null);
  useEffect(() => { if (editing && ref.current) { ref.current.focus(); ref.current.select(); } }, [editing]);
  const commit = () => {
    setEditing(false);
    const v = String(draft ?? '').trim();
    if (v && v !== value) onSave(v);
    else setDraft(value);
  };
  if (editing) {
    return html`<input
      ref=${ref}
      className=${cx('inline-edit-input', className)}
      value=${draft}
      maxLength=${maxLength}
      placeholder=${placeholder}
      onChange=${(e) => setDraft(e.target.value)}
      onBlur=${commit}
      onKeyDown=${(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setDraft(value); setEditing(false); }
      }}
    />`;
  }
  if (readOnly) return html`<span className=${cx('inline-edit', 'is-readonly', className)}>${value}</span>`;
  return html`<span
    className=${cx('inline-edit', className)}
    role="button"
    tabIndex=${0}
    onClick=${() => { setDraft(value); setEditing(true); }}
    onKeyDown=${(e) => { if (e.key === 'Enter') { setDraft(value); setEditing(true); } }}
    title="点击编辑"
  >
    ${value}<${Icon} name="PenLine" size=${13} className="inline-edit-icon" />
  </span>`;
}

function TimeRange({ value, onChange }) {
  return html`<${Select}
    width=${150}
    value=${value}
    onChange=${onChange}
    options=${[
      { value: '1h', label: '最近 1 小时' },
      { value: '24h', label: '最近 24 小时' },
      { value: '7d', label: '最近 7 天' },
      { value: '30d', label: '最近 30 天' },
      { value: '90d', label: '最近 90 天' },
    ]}
    renderValue=${(sel) => sel[0] && html`<span className="select-value"><${Icon} name="Calendar" size=${14} />${sel[0].label}</span>`}
  />`;
}
