(() => {
  const tree = window.CONSTITUTION_MAP;
  if (!tree) {
    console.error("CONSTITUTION_MAP が読み込めませんでした。");
    return;
  }

  const COL_W = [220, 240];
  const GAP_X = 76;
  const GAP_Y = 12;
  const NODE_H = 64;
  const ROOT_H = 76;
  const PAD = 28;
  const STORAGE_KEY = "kenpo-map-path-v1";

  const byId = new Map();
  const parentOf = new Map();

  function index(node, parent) {
    if (byId.has(node.id)) {
      console.error("重複した id:", node.id);
    }
    byId.set(node.id, node);
    if (parent) parentOf.set(node.id, parent.id);
    (node.children || []).forEach((child) => index(child, node));
  }
  index(tree, null);

  byId.forEach((node) => {
    if (node.seeId && !byId.has(node.seeId)) {
      console.error("seeId の参照先がありません:", node.id, node.seeId);
    }
  });

  const viewport = document.getElementById("map-viewport");
  const world = document.getElementById("map-world");
  const edgesSvg = document.getElementById("map-edges");
  const nodesEl = document.getElementById("map-nodes");
  const detail = document.getElementById("map-detail");
  const crumbs = document.getElementById("map-crumbs");
  const depthStat = document.getElementById("depth-text");
  const searchInput = document.getElementById("map-search");
  const hitsEl = document.getElementById("map-hits");
  const btnBack = document.getElementById("btn-back");
  const btnRoot = document.getElementById("btn-root");
  const btnZoomIn = document.getElementById("btn-zoom-in");
  const btnZoomOut = document.getElementById("btn-zoom-out");
  const btnFit = document.getElementById("btn-fit");

  let path = loadPath();
  let cam = { x: 36, y: 36, scale: 1 };
  let positions = new Map();
  let worldSize = { w: 0, h: 0 };

  function loadPath() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed[0] === "root" && parsed.every((id) => byId.has(id))) {
        return parsed;
      }
    } catch {
      /* 壊れた保存は捨てる */
    }
    return ["root"];
  }

  function savePath() {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(path));
  }

  function findPath(id) {
    const acc = [];
    let cursor = id;
    while (cursor) {
      acc.push(cursor);
      cursor = parentOf.get(cursor);
    }
    acc.reverse();
    return acc[0] === "root" ? acc : null;
  }

  function nodeSize(node) {
    if (node.id === "root") return { w: COL_W[0], h: ROOT_H };
    return { w: COL_W[1], h: NODE_H };
  }

  function colX(depth, side) {
    if (depth <= 0) return 0;
    const step = COL_W[1] + GAP_X;
    if (side > 0) return COL_W[0] + GAP_X + (depth - 1) * step;
    return -GAP_X - depth * COL_W[1] - (depth - 1) * GAP_X;
  }

  function layoutNode(node, depth, side, top, open) {
    const size = nodeSize(node);
    const kids = open.has(node.id) ? node.children || [] : [];
    const x = colX(depth, side);
    if (kids.length === 0) {
      return {
        items: [{ node, depth, x, y: top, w: size.w, h: size.h }],
        height: size.h,
      };
    }
    let y = top;
    const chunks = [];
    kids.forEach((child) => {
      const sub = layoutNode(child, depth + 1, side, y, open);
      chunks.push(sub);
      y += sub.height + GAP_Y;
    });
    const total = y - top - GAP_Y;
    const selfY = top + total / 2 - size.h / 2;
    const items = [{ node, depth, x, y: selfY, w: size.w, h: size.h }];
    chunks.forEach((sub) => items.push(...sub.items));
    return { items, height: Math.max(total, size.h) };
  }

  function layoutColumn(kids, side, open) {
    if (!kids.length) return { items: [], height: 0 };
    let y = 0;
    const chunks = [];
    kids.forEach((child) => {
      const sub = layoutNode(child, 1, side, y, open);
      chunks.push(sub);
      y += sub.height + GAP_Y;
    });
    return { items: chunks.flatMap((chunk) => chunk.items), height: y - GAP_Y };
  }

  function layoutVisible(open) {
    const kids = tree.children || [];
    const mid = Math.ceil(kids.length / 2);
    const left = layoutColumn(kids.slice(0, mid), -1, open);
    const right = layoutColumn(kids.slice(mid), 1, open);
    const height = Math.max(left.height, right.height, ROOT_H);
    left.items.forEach((item) => {
      item.y += (height - left.height) / 2;
    });
    right.items.forEach((item) => {
      item.y += (height - right.height) / 2;
    });
    const rootSize = nodeSize(tree);
    const items = [
      { node: tree, depth: 0, x: 0, y: (height - rootSize.h) / 2, w: rootSize.w, h: rootSize.h },
      ...left.items,
      ...right.items,
    ];
    let minX = Infinity;
    let minY = Infinity;
    items.forEach((item) => {
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
    });
    const dx = PAD - minX;
    const dy = PAD - minY;
    let maxX = 0;
    let maxY = 0;
    items.forEach((item) => {
      item.x += dx;
      item.y += dy;
      maxX = Math.max(maxX, item.x + item.w);
      maxY = Math.max(maxY, item.y + item.h);
    });
    return { items, width: maxX + PAD, height: maxY + PAD };
  }

  function applyCam() {
    world.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.scale})`;
  }

  function frame(id, fitAll) {
    const target = positions.get(id);
    const rect = viewport.getBoundingClientRect();
    if (!target || rect.width < 40 || rect.height < 40) return;

    const node = byId.get(id);
    const related = fitAll ? [...positions.values()] : [target];
    if (!fitAll && path.includes(id)) {
      (node.children || []).forEach((child) => {
        const pos = positions.get(child.id);
        if (pos) related.push(pos);
      });
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    related.forEach((box) => {
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.w);
      maxY = Math.max(maxY, box.y + box.h);
    });
    const margin = 28;
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const fitScale = Math.min(
      1,
      (rect.width - margin * 2) / bw,
      (rect.height - margin * 2) / bh
    );
    const scale = Math.max(0.28, fitScale);
    cam.scale = scale;
    cam.x = (rect.width - (minX + maxX) * scale) / 2;
    cam.y = (rect.height - (minY + maxY) * scale) / 2;
    applyCam();
  }

  function curve(x1, y1, x2, y2) {
    const dir = x2 >= x1 ? 1 : -1;
    const dx = Math.max(36, Math.abs(x2 - x1) * 0.5) * dir;
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }

  function renderMap() {
    const open = new Set(path);
    const laid = layoutVisible(open);
    positions = new Map();
    laid.items.forEach((item) => positions.set(item.node.id, item));
    worldSize = { w: laid.width, h: laid.height };
    world.style.width = `${worldSize.w}px`;
    world.style.height = `${worldSize.h}px`;

    const pathSet = open;
    const edgeParts = [];
    laid.items.forEach((item) => {
      if (!pathSet.has(item.node.id)) return;
      (item.node.children || []).forEach((child) => {
        const to = positions.get(child.id);
        if (!to) return;
        const toLeft = to.x < item.x;
        const x1 = toLeft ? item.x : item.x + item.w;
        const x2 = toLeft ? to.x + to.w : to.x;
        const y1 = item.y + item.h / 2;
        const y2 = to.y + to.h / 2;
        const active = pathSet.has(child.id);
        edgeParts.push(
          `<path d="${curve(x1, y1, x2, y2)}" class="map-edge${active ? " is-active" : ""}" />`
        );
      });
    });
    edgesSvg.setAttribute("width", String(worldSize.w));
    edgesSvg.setAttribute("height", String(worldSize.h));
    edgesSvg.innerHTML = edgeParts.join("");

    const selected = path[path.length - 1];
    nodesEl.innerHTML = laid.items
      .map((item) => {
        const node = item.node;
        const kids = node.children ? node.children.length : 0;
        const classes = [
          "map-node",
          `kind-${node.kind || "group"}`,
          pathSet.has(node.id) ? "is-on-path" : "",
          node.id === selected ? "is-selected" : "",
          node.id === "root" ? "is-root" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const count = kids ? `<span class="map-node-count">${kids}</span>` : "";
        const study = node.study ? `<span class="map-node-study">授業</span>` : "";
        return `<button type="button" class="${classes}" data-id="${node.id}" style="left:${item.x}px;top:${item.y}px;width:${item.w}px;height:${item.h}px" aria-expanded="${kids ? pathSet.has(node.id) : "false"}" aria-current="${node.id === selected ? "true" : "false"}">
          <span class="map-node-label">${escapeHtml(node.label)}</span>
          <span class="map-node-hint">${escapeHtml(node.hint || (kids ? `${kids}本の枝` : "要点"))}</span>
          ${study}${count}
        </button>`;
      })
      .join("");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderCrumbs() {
    crumbs.innerHTML = path
      .map((id, index) => {
        const node = byId.get(id);
        const current = index === path.length - 1;
        return `<button type="button" class="crumb${current ? " is-current" : ""}" data-id="${id}">${escapeHtml(node.label)}</button>`;
      })
      .join('<span class="crumb-sep" aria-hidden="true">›</span>');
    btnBack.disabled = path.length <= 1;
    if (depthStat) depthStat.textContent = String(Math.max(0, path.length - 1));
  }

  function renderDetail() {
    const node = byId.get(path[path.length - 1]);
    const kids = node.children || [];
    const see = node.seeId ? byId.get(node.seeId) : null;
    const art = node.arts && node.arts[0];
    const quiz =
      node.id === "pre" || node.id.startsWith("pre-") || (art && art <= 28)
        ? `<p class="map-detail-foot"><a href="index.html">前文から第28条の穴埋めへ</a></p>`
        : `<p class="map-detail-foot">前文から第28条は<a href="index.html">穴埋め</a>、指定条文は<a href="study.html">授業セット</a>。</p>`;
    const quote = node.quote
      ? `<blockquote class="map-quote">${escapeHtml(node.quote)}</blockquote>`
      : "";
    const seeBtn = see
      ? `<button type="button" class="btn btn-secondary map-see" data-id="${see.id}">「${escapeHtml(see.label)}」の枝を開く</button>`
      : "";
    const childButtons = kids.length
      ? `<div class="map-child-list">${kids
          .map(
            (child) =>
              `<button type="button" class="map-child" data-id="${child.id}"><span>${escapeHtml(child.label)}</span><small>${escapeHtml(child.hint || "")}</small></button>`
          )
          .join("")}</div>`
      : "";
    detail.innerHTML = `
      <p class="chapter">${escapeHtml(node.hint || "日本国憲法")}${node.study ? " · 授業" : ""}</p>
      <h2>${escapeHtml(node.label)}</h2>
      <p class="map-body">${escapeHtml(node.body)}</p>
      ${quote}
      ${seeBtn}
      ${kids.length ? `<p class="map-child-label">この先の枝 ${kids.length}</p>${childButtons}` : ""}
      ${quiz}
    `;
  }

  function select(id, options) {
    const next = findPath(id);
    if (!next) return;
    path = next;
    savePath();
    renderMap();
    renderCrumbs();
    renderDetail();
    if (!options || options.frame !== false) frame(id);
  }

  function parseArticleQuery(query) {
    const arabic = query.match(/\d{1,3}/);
    if (arabic) return Number(arabic[0]);
    const kanji = query.match(/[一二三四五六七八九十百〇零]+/);
    if (!kanji) return null;
    const map = { 〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    let total = 0;
    let current = 0;
    for (const ch of kanji[0]) {
      if (ch in map) current = map[ch];
      else if (ch === "十") {
        total += (current || 1) * 10;
        current = 0;
      } else if (ch === "百") {
        total += (current || 1) * 100;
        current = 0;
      } else return null;
    }
    const value = total + current;
    return value > 0 ? value : null;
  }

  function normalize(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
      .replace(/\s+/g, "");
  }

  function search(query) {
    const q = normalize(query);
    if (!q) return [];
    const article = parseArticleQuery(q);
    const hits = [];
    byId.forEach((node) => {
      if (node.id === "root") return;
      let score = 0;
      const label = normalize(node.label);
      const hint = normalize(node.hint);
      const body = normalize(node.body);
      if (article && node.arts && node.arts.includes(article)) score += node.arts.length === 1 ? 120 : 90;
      if (label.includes(q)) score += 80;
      if (hint.includes(q)) score += 50;
      if (body.includes(q)) score += 20;
      if (score > 0) hits.push({ node, score });
    });
    hits.sort((a, b) => b.score - a.score || a.node.label.length - b.node.label.length);
    return hits.slice(0, 8);
  }

  function renderHits() {
    const query = searchInput.value;
    const hits = search(query);
    if (!normalize(query)) {
      hitsEl.hidden = true;
      hitsEl.innerHTML = "";
      return;
    }
    hitsEl.hidden = false;
    hitsEl.innerHTML = hits.length
      ? hits
          .map(
            (hit) =>
              `<li><button type="button" data-id="${hit.node.id}"><strong>${escapeHtml(hit.node.label)}</strong><span>${escapeHtml(hit.node.hint || "")}</span></button></li>`
          )
          .join("")
      : `<li class="map-hit-empty">該当する枝がありません</li>`;
  }

  nodesEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-id]");
    if (!button) return;
    select(button.dataset.id);
  });

  crumbs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-id]");
    if (!button) return;
    select(button.dataset.id);
  });

  detail.addEventListener("click", (event) => {
    const button = event.target.closest("[data-id]");
    if (!button) return;
    select(button.dataset.id);
  });

  hitsEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-id]");
    if (!button) return;
    searchInput.value = "";
    hitsEl.hidden = true;
    select(button.dataset.id);
  });

  searchInput.addEventListener("input", renderHits);
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const first = hitsEl.querySelector("[data-id]");
      if (first) {
        event.preventDefault();
        searchInput.value = "";
        hitsEl.hidden = true;
        select(first.dataset.id);
      }
    }
    if (event.key === "Escape") {
      searchInput.value = "";
      hitsEl.hidden = true;
    }
  });

  btnBack.addEventListener("click", () => {
    if (path.length <= 1) return;
    select(path[path.length - 2]);
  });
  btnRoot.addEventListener("click", () => select("root"));
  btnZoomIn.addEventListener("click", () => zoomBy(1.15));
  btnZoomOut.addEventListener("click", () => zoomBy(1 / 1.15));
  btnFit.addEventListener("click", () => frame(path[path.length - 1], true));

  function zoomBy(factor) {
    const rect = viewport.getBoundingClientRect();
    const px = rect.width / 2;
    const py = rect.height / 2;
    const next = Math.min(1.45, Math.max(0.4, cam.scale * factor));
    cam.x = px - ((px - cam.x) * next) / cam.scale;
    cam.y = py - ((py - cam.y) * next) / cam.scale;
    cam.scale = next;
    applyCam();
  }

  let drag = null;
  viewport.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".map-node")) return;
    drag = {
      id: event.pointerId,
      x: event.clientX - cam.x,
      y: event.clientY - cam.y,
      moved: false,
    };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add("is-dragging");
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const x = event.clientX - drag.x;
    const y = event.clientY - drag.y;
    if (Math.abs(x - cam.x) + Math.abs(y - cam.y) > 3) drag.moved = true;
    cam.x = x;
    cam.y = y;
    applyCam();
  });
  function endDrag(event) {
    if (!drag || drag.id !== event.pointerId) return;
    drag = null;
    viewport.classList.remove("is-dragging");
  }
  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);

  viewport.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const factor = event.deltaY < 0 ? 1.08 : 0.92;
      const next = Math.min(1.45, Math.max(0.4, cam.scale * factor));
      cam.x = px - ((px - cam.x) * next) / cam.scale;
      cam.y = py - ((py - cam.y) * next) / cam.scale;
      cam.scale = next;
      applyCam();
    },
    { passive: false }
  );

  document.addEventListener("keydown", (event) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (event.key === "ArrowLeft" || event.key === "Backspace") {
      if (path.length > 1) {
        event.preventDefault();
        select(path[path.length - 2]);
      }
    }
  });

  window.addEventListener("resize", () => frame(path[path.length - 1]));

  renderMap();
  renderCrumbs();
  renderDetail();
  requestAnimationFrame(() => frame(path[path.length - 1]));
})();
