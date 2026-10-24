// ==UserScript==
// @name         豆瓣想看 → 搜中创
// @namespace    https://github.com/local/douban-zhongchuang
// @version      2.13.0
// @description  豆瓣影视页面三站快捷搜索（中创/B站/SoQuark），中文片名优先；影视片单全量按评分或年份排序。无需本地数据存储。
// @author       Senior Developer
// @match        https://movie.douban.com/*
// @match        https://www.douban.com/doulist/*
// @match        https://douban.com/doulist/*
// @icon         https://www.douban.com/favicon.ico
// @grant        GM_openInTab
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        SEARCH_URL: 'https://www.zhongchuangwl.com/s/{q}/',
        BUTTON_TEXT: '搜中创',
        BILIBILI_BUTTON_TEXT: '搜B站',
        SOQUARK_BUTTON_TEXT: '搜夸克',
        STRIP_TRAILING_PUNCT: true,
        STRIP_SEASON_SUFFIX: false,
        DEBUG: false,
    };
    const MARK_ATTR = 'data-zcw-done';
    const BTN_CLASS = 'zcw-search-btn';
    const BILIBILI_BTN_CLASS = 'zcw-bilibili-btn';
    const SOQUARK_BTN_CLASS = 'zcw-soquark-btn';
    const SUBJECT_RE = /\/subject\/(\d+)\/?/;
    const HAS_CJK = /[\u4e00-\u9fa5]/;
    const ROOT_SELECTORS = ['#content .article', '#content', 'body'];
    const EXCLUDE_SELECTOR = '.aside, #footer, .site-nav, #db-global-nav, [id^="dale_"], [class*="rec_"]';
    const DEBUG = CONFIG.DEBUG || /(^|[#&?])zcwdebug\b/.test(location.hash + location.search);
    const log = (...args) => DEBUG && console.log('[豆瓣搜索]', ...args);

    const CSS = `
    .zcw-group{display:inline}
    .zcw-search-btn,.zcw-bilibili-btn,.zcw-soquark-btn{
        display:inline-block;margin-left:8px;padding:1px 9px;
        font-family:inherit;font-size:12px;line-height:17px;font-weight:600;
        text-decoration:none!important;white-space:nowrap;vertical-align:middle;
        border:1px solid;border-radius:4px;cursor:pointer;appearance:none;user-select:none;
    }
    .zcw-search-btn{color:#fff;background:#197cff;border-color:#1567d6}
    .zcw-search-btn:hover{color:#fff!important;background:#1567d6}
    .zcw-bilibili-btn{color:#b8325c;border-color:#b8325c;background:transparent}
    .zcw-bilibili-btn:hover{background:rgba(251,114,153,.12)}
    .zcw-soquark-btn{color:#087f70;border-color:#087f70;background:transparent}
    .zcw-soquark-btn:hover{background:rgba(8,127,112,.12)}
    .zcw-group>a::after,.zcw-group>button::after{content:none!important}
    .zcw-group>a:focus-visible,.zcw-group>button:focus-visible{outline:2px solid #197cff;outline-offset:2px}
    @media(prefers-color-scheme:dark){
        .zcw-search-btn{color:#0f1720;background:#8abde1;border-color:#8abde1}
        .zcw-search-btn:hover{color:#0f1720!important;background:#9ccce9}
        .zcw-bilibili-btn{color:#ffb2c8;border-color:#ffb2c8;background:#482631}
        .zcw-bilibili-btn:hover{background:#663545}
        .zcw-soquark-btn{color:#71dac3;border-color:#71dac3;background:#18382f}
        .zcw-soquark-btn:hover{background:#214b3f}
    }`;
    function injectStyle() {
        if (document.getElementById('zcw-style')) return;
        const style = document.createElement('style');
        style.id = 'zcw-style'; style.textContent = CSS;
        (document.head || document.documentElement).appendChild(style);
    }

    function toSegments(text) {
        return (text || '')
            .replace(/\[[^\]]*\]/g, ' ')        // 去掉「[可播放]」等噪声
            .replace(/\s+/g, ' ')
            .split('/')
            .map(s => s.trim())
            .filter(Boolean);
    }

    function preferredSearchTitle(value) {
        if (typeof value !== 'string') return '';
        const annotations = /(?:\s*[（(](?:\d{4}|港|台|豆友译名|豆瓣(?:电影)?)[）)])+\s*$/;
        const raw = value.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ')
            .replace(annotations, '').trim();
        if (!raw) return '';
        const parts = toSegments(raw).map(s => s.replace(annotations, '').trim()).filter(Boolean);
        const kana = /[\u3040-\u30ff]/;
        const chineseToken = s => HAS_CJK.test(s) && !kana.test(s);
        const chinese = parts.find(s => s.split(/\s+/).some(chineseToken));
        let selected;
        if (chinese) {
            const tokens = chinese.split(/\s+/);
            let first = tokens.findIndex(chineseToken);
            let last = tokens.length - 1;
            while (last > first && !chineseToken(tokens[last])) last--;
            if (first > 0 && /^Re[:：]$/i.test(tokens[first - 1])) first--;
            // 年份、3D/4K、Season 2 仍属于片名；后面的英文原名不带入。
            while (last + 1 < tokens.length) {
                if (/^(?:\d{4}|\d+[dDkK])$/.test(tokens[last + 1])) last++;
                else if (/^(?:Season|Part)$/i.test(tokens[last + 1]) && /^\d+$/.test(tokens[last + 2] || '')) last += 2;
                else break;
            }
            selected = tokens.slice(first, last + 1).join(' ');
        } else {
            const english = parts.find(s => /[a-z]/i.test(s) && !HAS_CJK.test(s) && !kana.test(s));
            // Face/Off 等正式英文片名中的无空格斜杠不能被当作别名分隔。
            selected = !HAS_CJK.test(raw) && !kana.test(raw) && !/\s\/|\/\s/.test(raw) ? raw : english || parts[0] || '';
        }
        return selected.replace(/(?:\s*[（(](?:\d{4}|港|台|豆友译名|豆瓣(?:电影)?)[）)])+\s*$/, '').trim();
    }

    function extractTitle(anchor) {
        const em = anchor.querySelector('em');
        const fullText = anchor.textContent || '';
        // 主名优先取 <em>（豆瓣把「中文名 / 原名」放在 em 里，别名在 em 外）
        let segments = toSegments(em ? em.textContent : fullText);
        if (!segments.length) {
            // 兜底：海报链接只有 <img>，标题在 title 属性 / alt 上
            segments = toSegments(anchor.getAttribute('title') ||
                                  (anchor.querySelector('img') || {}).alt || '');
        }
        if (!segments.length) return '';

        const primary = (em ? em.textContent : fullText) || anchor.getAttribute('title') ||
                        (anchor.querySelector('img') || {}).alt || '';
        let title = preferredSearchTitle(primary);
        // em 是主名；仅当 em 缺中文时才从外部别名补中文，避免切坏 Face/Off。
        if (em && (!HAS_CJK.test(title) || /[\u3040-\u30ff]/.test(title))) {
            const alias = preferredSearchTitle(fullText);
            if (HAS_CJK.test(alias)) title = alias;
        }

        // 去掉「(港)」「(台)」「(豆友译名)」这类地区/来源标注
        title = title.replace(/\s*[（(][^）)]*[）)]\s*$/, '').trim();

        if (CONFIG.STRIP_SEASON_SUFFIX) {
            title = title.replace(/\s*第[一二三四五六七八九十百零\d]+[季部]\s*$/, '')
                         .replace(/\s*Season\s*\d+\s*$/i, '')
                         .trim();
        }
        if (CONFIG.STRIP_TRAILING_PUNCT) {
            title = title.replace(/[。．.，,、！!？?~～\s]+$/, '').trim();
        }
        return title;
    }

    function resolveSearchTitle(title) {
        if (title && String(title).trim()) return preferredSearchTitle(String(title));
        // 只去除豆瓣站名后缀，不在 Spider-Man 等正式片名的连字符处截断。
        const t = (document.title || '').replace(/(?:\s*[-–—|]\s*(?:豆瓣(?:电影)?|电影))+\s*$/, '').trim();
        if (!t) return '';
        return preferredSearchTitle(t);
    }

    const MAX_SEARCH_TITLE_CHARS = 18;

    function sanitizeSearchTitle(title) {
        let s = String(title == null ? '' : title).trim();
        if (!s) return '';
        s = s.replace(/^(?:\s*Re\s*[：:]\s*)+/i, '').trim();
        if (!s) return '';
        if (s.length <= MAX_SEARCH_TITLE_CHARS) return s;
        const cut = s.substring(0, MAX_SEARCH_TITLE_CHARS);
        const breaks = [...cut.matchAll(/[\s\-—–_·:：、]/g)].map(m => m.index);
        if (breaks.length) {
            const last = breaks[breaks.length - 1];
            if (last >= MAX_SEARCH_TITLE_CHARS * 0.5) {
                s = cut.substring(0, last).trim();
            } else {
                s = cut;
            }
        } else {
            s = cut;
        }
        s = s.replace(/[\s\-—–_·:：、。.,，;；!！?？]+$/, '').trim();
        return s;
    }

    function buildSearchUrl(title) {
        const safe = sanitizeSearchTitle(preferredSearchTitle(title));
        if (!safe) return '';
        let url = CONFIG.SEARCH_URL.replace('{q}', encodeURIComponent(safe));
        return url;
    }

    const BILIBILI_SEARCH_URL = 'https://search.bilibili.com/all';
    const SOQUARK_SEARCH_URL = 'https://www.soquark.com/s/';

    function buildBilibiliKeyword(title) {
        if (typeof title !== 'string') return '';
        let s = title.trim();
        if (!s) return '';
        return preferredSearchTitle(s);
    }

    function buildBilibiliSearchUrl(title) {
        const keyword = buildBilibiliKeyword(title);
        if (!keyword) return null;
        const u = new URL(BILIBILI_SEARCH_URL);
        u.searchParams.set('keyword', keyword);   // URL API 负责编码，不手动 encodeURIComponent
        return u.href;
    }

    function buildSoquarkSearchUrl(title) {
        const keyword = preferredSearchTitle(title);
        return keyword ? SOQUARK_SEARCH_URL + encodeURIComponent(keyword) + '.html' : null;
    }


    // 三个入口统一打开新标签；不访问任何本地存储。
    function openSearchUrl(url) {
        if (!url) return false;
        try {
            if (typeof GM_openInTab === 'function') {
                GM_openInTab(url, { active: true, insert: true, setParent: true });
                return true;
            }
            if (typeof window.open === 'function') {
                window.open(url, '_blank', 'noopener');
                return true;
            }
        } catch (e) { log('打开搜索页失败', e); }
        return false;
    }
    const ExternalSearchAction = {
        openBilibili: title => openSearchUrl(buildBilibiliSearchUrl(title)),
        openSoquark: title => openSearchUrl(buildSoquarkSearchUrl(title)),
    };

    function subjectId(a) {
        const raw = (a.getAttribute && a.getAttribute('href')) || '';
        const abs = (typeof a.href === 'string' && a.href) ? a.href : raw;
        // 仅识别「影视」条目，避免把书籍/音乐等其它域片单的条目误当影视：
        //  - 相对 /subject/ 链接：仅在 movie.douban.com 域内算影视（其它域相对链接指向其自身 /subject，如 book）
        //  - 绝对 movie.douban.com/subject/ 链接：跨域片单（www.douban.com/doulist）里的影视条目
        if (/^\/subject\//.test(raw)) {
            if (location.hostname === 'movie.douban.com') {
                const m = SUBJECT_RE.exec(raw);
                return m ? m[1] : null;
            }
            return null;
        }
        if (/^https?:\/\/movie\.douban\.com\/subject\//i.test(abs) || /^https?:\/\/movie\.douban\.com\/subject\//i.test(raw)) {
            const m = SUBJECT_RE.exec(abs || raw);
            return m ? m[1] : null;
        }
        return null;
    }

    function collectAnchors(root) {
        return [...root.querySelectorAll('a[href*="/subject/"]')].filter(a => {
            if (a.classList.contains(BTN_CLASS)) return false;
            if (!subjectId(a)) return false;
            if (a.closest(EXCLUDE_SELECTOR)) return false;   // 侧栏 / 广告 / 页脚
            if (a.closest('.hide')) return false;            // list 视图里的隐藏详情块
            return true;
        });
    }

    /** 同一记录的多个链接里挑出「标题链接」：优先 <em>，其次有文字，最后海报链接 */
    function pickTitleAnchor(anchors) {
        if (!anchors || !anchors.length) return null;
        return anchors.find(a => a.querySelector('em')) ||
               anchors.find(a => (a.textContent || '').trim().length > 0) ||
               anchors[0];
    }

    /** 元素子树内包含几个「不同」的条目 id（带缓存） */
    function distinctSubjectCount(el, cache) {
        if (cache && cache.has(el)) return cache.get(el);
        const ids = new Set();
        el.querySelectorAll('a[href*="/subject/"]').forEach(a => {
            const id = subjectId(a);
            if (id) ids.add(id);
        });
        if (cache) cache.set(el, ids.size);
        return ids.size;
    }

    /**
     * 记录容器 = 从链接向上回溯，仍然「只包含这一条记录」的最大祖先。
     * 这样海报链接与标题链接会收敛到同一个容器，且完全不依赖 class 命名。
     * 再往上一层就会混入其它条目，即为列表容器，到此为止。
     */
    function recordContainer(anchor, root, cache) {
        let best = anchor;
        let node = anchor;
        while (node && node.parentElement) {
            const p = node.parentElement;
            if (p === root || isPageWide(p)) break;
            if (distinctSubjectCount(p, cache) > 1) break;   // 上一层混入了别的条目
            best = p;
            node = p;
        }
        return best;
    }

    function isPageWide(el) {
        const id = el.id || '';
        return el.tagName === 'BODY' || el.tagName === 'HTML' ||
               id === 'content' || id === 'wrapper' || id === 'db-global-nav' ||
               (el.classList && el.classList.contains('article'));
    }


    function createButton(title, doubanId) {
        const resolved = resolveSearchTitle(title);
        const url = buildSearchUrl(resolved);
        if (!url) return null;
        const group = document.createElement('span');
        group.className = 'zcw-group';
        const button = document.createElement('a');
        button.className = BTN_CLASS;
        button.textContent = CONFIG.BUTTON_TEXT;
        button.href = url; button.target = '_blank'; button.rel = 'noopener noreferrer';
        button.title = '在中创网搜索：' + resolved;
        button.setAttribute('data-zcw-title', resolved);
        if (doubanId) button.setAttribute('data-zcw-id', doubanId);
        button.addEventListener('click', e => {
            if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
            e.preventDefault(); e.stopPropagation(); openSearchUrl(url);
        });
        group.appendChild(button);
        const bili = createBilibiliButton(resolved), soquark = createSoquarkButton(resolved);
        if (bili) group.appendChild(bili);
        if (soquark) group.appendChild(soquark);
        return group;
    }
    function externalButton(title, className, text, buildUrl, action) {
        if (typeof title !== 'string' || !title.trim()) return null;
        const resolved = resolveSearchTitle(title);
        if (!buildUrl(resolved)) return null;
        const button = document.createElement('button');
        button.type = 'button'; button.className = className; button.textContent = text;
        button.title = text + '：' + resolved;
        button.setAttribute('data-zcw-title', resolved);
        button.addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation(); action(resolved);
        });
        return button;
    }
    function createBilibiliButton(title) {
        return externalButton(title, BILIBILI_BTN_CLASS, CONFIG.BILIBILI_BUTTON_TEXT,
            buildBilibiliSearchUrl, title => ExternalSearchAction.openBilibili(title));
    }
    function createSoquarkButton(title) {
        return externalButton(title, SOQUARK_BTN_CLASS, CONFIG.SOQUARK_BUTTON_TEXT,
            buildSoquarkSearchUrl, title => ExternalSearchAction.openSoquark(title));
    }

    function insertButton(titleAnchor, btn) {
        const parent = titleAnchor.parentElement;
        const badParent = !parent || ['A', 'EM', 'B', 'STRONG', 'IMG'].includes(parent.tagName);
        if (badParent) {
            titleAnchor.insertAdjacentElement('afterend', btn);
        } else {
            // 追加到标题容器末尾（排在「[可播放]」之后），视觉最整齐
            parent.appendChild(btn);
        }
    }


    function getRoot() {
        for (const sel of ROOT_SELECTORS) {
            const el = document.querySelector(sel);
            if (el) return el;
        }
        return document.body;
    }


    function extractDoubanMovie(root, page) {
        return page.type === 'subject' ? extractSubjectEntry(root, page) : collectListEntries(root);
    }

    /** 列表页条目抽取（完全复用已有的锚点定位，不复制逻辑） */
    function collectListEntries(root) {
        const anchors = collectAnchors(root);
        if (!anchors.length) return [];
        const cache = new WeakMap();
        const records = new Map();
        anchors.forEach(a => {
            const box = recordContainer(a, root, cache);
            if (!records.has(box)) records.set(box, []);
            records.get(box).push(a);
        });
        const entries = [];
        records.forEach((list, box) => {
            const titleAnchor = pickTitleAnchor(list);
            if (!titleAnchor) return;
            const doubanId = subjectId(titleAnchor);
            const title = extractTitle(titleAnchor);
            if (!title) return;
            entries.push({ doubanId, title, titleAnchor, markNode: box, mount: titleAnchor, mountMode: 'list' });
        });
        return entries;
    }

    /** 影视详情页：整页只有 1 部影片，标题取 h1，id 取 URL（不扫推荐位）。
     *  标准选择器拿不到时回落到 <title> 标签（resolveSearchTitle），保证搜索词非空。 */
    function extractSubjectEntry(root, page) {
        const h1 = document.querySelector('#content h1') || root.querySelector('h1') || document.querySelector('h1');
        let title = '';
        if (h1) {
            const titleEl = h1.querySelector('span[property="v:itemreviewed"]') ||
                           h1.querySelector('a[href*="/subject/"]') || h1;
            title = extractTitle(titleEl);
        }
        if (!title) title = resolveSearchTitle('');        // 回落 <title>
        if (!title) return [];
        // 挂载点：优先 h1；h1 缺失时退回 #content / root / body（保证按钮总能插入）
        const mount = h1 || document.querySelector('#content') || root || document.body;
        return [{ doubanId: page.id, title, titleAnchor: h1 || mount, markNode: mount, mount: mount, mountMode: 'after' }];
    }


    function renderActions(entry) {
        const group = createButton(entry.title, entry.doubanId);
        if (!group) return false;
        if (entry.mountMode === 'after') {
            if (entry.mount === document.body) entry.mount.appendChild(group);
            else entry.mount.insertAdjacentElement('afterend', group);
        } else insertButton(entry.titleAnchor, group);
        return true;
    }

    const DoulistSort = (() => {
        const ID = 'zcw-doulist-sort';
        const MODES = [
            ['original', '原片单顺序'], ['rating-desc', '评分：高 → 低'],
            ['rating-asc', '评分：低 → 高'], ['year-desc', '年份：新 → 旧'],
            ['year-asc', '年份：旧 → 新'],
        ];
        let state = null;

        function movieAnchor(node) {
            return [...node.querySelectorAll('a[href]')].find(a => {
                try {
                    const u = new URL(a.getAttribute('href'), location.href);
                    return u.hostname === 'movie.douban.com' && /^\/subject\/\d+\/?$/.test(u.pathname);
                } catch (e) { return false; }
            });
        }

        function readMeta(node) {
            const value = (node.querySelector('.rating_nums')?.textContent || '').trim();
            const rating = /^\d+(?:\.\d+)?$/.test(value) && Number(value) <= 10 ? Number(value) : null;
            // 只读取影片简介的年份，避免把评论或片单添加时间当作上映年份。
            const abstract = node.querySelector('.abstract');
            const lines = abstract ? abstract.innerHTML.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '') : '';
            const match = /(?:^|\n)\s*年份\s*[:：]\s*(\d{4})(?!\d)/.exec(lines);
            return { movie: !!movieAnchor(node), rating, year: match ? Number(match[1]) : null };
        }

        function sortEntries(entries, mode) {
            if (mode === 'original') return entries.slice();
            const field = mode.startsWith('rating-') ? 'rating' : 'year';
            const direction = mode.endsWith('-asc') ? 1 : -1;
            const movies = entries.filter(e => e.meta.movie).slice().sort((a, b) => {
                const x = a.meta[field], y = b.meta[field];
                if (x === null || y === null) return x === y ? a.order - b.order : x === null ? 1 : -1;
                return direction * (x - y) || a.order - b.order;
            });
            let i = 0;
            // 书籍等非影视条目保持在原槽位。
            return entries.map(e => e.meta.movie ? movies[i++] : e);
        }

        function items(root) { return [...root.querySelectorAll('.doulist-item')]; }
        function itemKey(node) {
            return node.id ? 'id:' + node.id : 'href:' + (node.querySelector('.title a[href], a.title[href], a[href*="/subject/"]')?.getAttribute('href') || '');
        }
        function safePageUrl(value) {
            const u = new URL(value, location.href);
            if (u.origin !== location.origin || u.pathname !== location.pathname ||
                !/^\d+$/.test(u.searchParams.get('start') || '0')) throw new Error('分页地址不属于当前片单');
            // 豆瓣的分页链接可能省略筛选参数，不能因此混入另一组结果。
            for (const [key, val] of new URL(location.href).searchParams) {
                if (key === 'start') continue;
                if (!u.searchParams.has(key)) u.searchParams.set(key, val);
                else if (u.searchParams.get(key) !== val) throw new Error('分页筛选条件发生变化');
            }
            u.hash = '';
            return u;
        }
        function pageKey(u) { return Number(u.searchParams.get('start') || 0); }
        function pageCount(root) {
            const n = Number(root.querySelector('.paginator [data-total-page]')?.getAttribute('data-total-page'));
            return Number.isInteger(n) && n > 0 ? n : 1;
        }

        function importItem(node, url) {
            const copy = document.importNode(node, true);
            copy.querySelectorAll('script, style, link, iframe, object, embed, base, meta, form').forEach(n => n.remove());
            [copy, ...copy.querySelectorAll('*')].forEach(el => {
                [...el.attributes].forEach(attr => {
                    if (/^on/i.test(attr.name) || ['srcdoc', 'style'].includes(attr.name.toLowerCase())) el.removeAttribute(attr.name);
                    if (['href', 'src', 'action', 'formaction', 'xlink:href'].includes(attr.name.toLowerCase())) {
                        try {
                            const target = new URL(attr.value, url);
                            if (!['https:', 'http:'].includes(target.protocol)) el.removeAttribute(attr.name);
                            else el.setAttribute(attr.name, target.href);
                        } catch (e) { el.removeAttribute(attr.name); }
                    }
                });
            });
            return copy;
        }

        function pause(signal) {
            return new Promise((resolve, reject) => {
                const cancel = () => { clearTimeout(timer); reject(new Error('cancelled')); };
                const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, 600);
                signal.addEventListener('abort', cancel, { once: true });
                if (signal.aborted) cancel();
            });
        }

        async function collect(s, signal, controller) {
            const first = safePageUrl(location.href);
            first.searchParams.set('start', '0');
            let next = first, expected = pageCount(s.root), pages = 0;
            const visited = new Set(), signatures = new Set(), entries = [];
            const local = new Map(items(s.root).map(n => [itemKey(n), n]));
            while (next) {
                if (signal.aborted) throw new Error('cancelled');
                const offset = pageKey(next);
                if (visited.has(offset) || pages >= 1000) throw new Error('分页重复或页数异常');
                visited.add(offset);
                let root;
                if (offset === pageKey(new URL(location.href))) {
                    root = s.root;
                } else {
                    if (pages) await pause(signal);
                    s.message.textContent = `正在加载第 ${pages + 1} 页（已读取 ${entries.filter(e => e.meta.movie).length} 部影视）…`;
                    const timer = setTimeout(() => controller.abort('timeout'), 20000);
                    try {
                        const response = await fetch(next.href, { credentials: 'same-origin', signal });
                        if (!response.ok) throw new Error('HTTP ' + response.status);
                        if (response.url) safePageUrl(response.url);
                        const html = await response.text();
                        if (signal.aborted) throw new Error('cancelled');
                        const doc = new DOMParser().parseFromString(html, 'text/html');
                        root = doc.querySelector('#content .article');
                        if (!root || !items(root).length) throw new Error('页面没有片单条目，可能需要登录或验证');
                    } finally { clearTimeout(timer); }
                }
                const nodes = items(root);
                const signature = nodes.map(itemKey).join('|');
                if (!nodes.length || signatures.has(signature)) throw new Error('分页内容为空或重复');
                signatures.add(signature);
                expected = Math.max(expected, pageCount(root));
                nodes.forEach(n => {
                    const node = local.get(itemKey(n)) || importItem(n, next.href);
                    entries.push({ node, meta: readMeta(node), order: entries.length });
                });
                pages++;
                s.message.textContent = `已读取 ${pages} / ${expected} 页（${entries.filter(e => e.meta.movie).length} 部影视）…`;
                const href = root.querySelector('.paginator .next a[href], .paginator a[rel="next"], .paginator link[rel="next"]')?.getAttribute('href');
                next = href ? safePageUrl(new URL(href, next.href).href) : null;
                if (!next && pages < expected) throw new Error('分页不完整，请刷新后重试');
            }
            return entries;
        }

        function render(s, mode) {
            const list = sortEntries(s.entries, mode);
            const old = items(s.root);
            const marker = document.createComment('zcw-doulist-items');
            old[0].before(marker);
            old.forEach(n => n.remove());
            const fragment = document.createDocumentFragment();
            list.forEach(e => fragment.appendChild(e.node));
            marker.replaceWith(fragment);
            s.root.querySelectorAll('.paginator').forEach(el => { el.hidden = true; });
            s.applied = mode;
            s.message.textContent = `已加载完整片单：${s.entries.filter(e => e.meta.movie).length} 部影视 · ${MODES.find(m => m[0] === mode)[1]}`;
            process();
        }

        async function change(s) {
            const mode = s.select.value;
            if (!MODES.some(m => m[0] === mode) || s.controller) return;
            const matches = nodes => {
                const current = new Set(items(s.root));
                return current.size === nodes.length && nodes.every(n => current.has(n));
            };
            if (s.entries) {
                if (!matches(s.entries.map(e => e.node))) {
                    s.select.value = s.applied;
                    s.message.textContent = '片单条目发生变化，请刷新页面后重新加载排序。';
                    return;
                }
                s.entries.forEach(e => { e.meta = readMeta(e.node); });
                render(s, mode);
                return;
            }
            if (mode === 'original') return;
            const controller = new AbortController();
            const initialNodes = items(s.root);
            s.controller = controller;
            s.bar.setAttribute('aria-busy', 'true');
            s.select.disabled = true;
            s.cancel.hidden = false;
            s.message.textContent = '正在加载完整片单…';
            try {
                const entries = await collect(s, controller.signal, controller);
                if (controller.signal.aborted) throw new Error('cancelled');
                if (!matches(initialNodes)) throw new Error('片单条目发生变化，请刷新后重新加载');
                s.entries = entries;
                render(s, mode);
            } catch (e) {
                s.select.value = s.applied;
                const reason = controller.signal.reason;
                s.message.textContent = controller.signal.aborted && reason !== 'timeout'
                    ? '已取消，保留原列表。'
                    : '加载失败：' + (reason === 'timeout' ? '请求超时' : e.message) + '。保留原列表，可重新选择排序重试。';
            } finally {
                s.controller = null;
                s.bar.setAttribute('aria-busy', 'false');
                s.select.disabled = false;
                s.cancel.hidden = true;
            }
        }

        function ensure(page) {
            if (page.site !== 'douban' || page.type !== 'doulist' || document.getElementById(ID)) return;
            const root = document.querySelector('#content .article');
            if (!root || !items(root).some(n => movieAnchor(n))) return;
            // 片单原生条目应属于同一个容器，未知结构不移动节点。
            const nodes = items(root);
            if (!nodes.every(n => n.parentElement === nodes[0].parentElement)) return;
            const bar = document.createElement('div');
            bar.id = ID;
            bar.setAttribute('aria-busy', 'false');
            const label = document.createElement('label');
            label.textContent = '整单排序：';
            const select = document.createElement('select');
            select.setAttribute('aria-label', '整单排序');
            MODES.forEach(([value, text]) => {
                const option = document.createElement('option');
                option.value = value; option.textContent = text; select.appendChild(option);
            });
            label.appendChild(select);
            const cancel = document.createElement('button');
            cancel.type = 'button'; cancel.textContent = '取消加载'; cancel.hidden = true;
            const message = document.createElement('span');
            message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
            message.textContent = '选择排序后加载全部分页；上映时间按年份。';
            bar.append(label, cancel, message);
            const style = document.createElement('style');
            style.textContent = `#${ID}{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:12px;margin:12px 0;border:1px solid #ddd;border-radius:4px;background:#f7f9fb;font-size:13px;color:#555}#${ID} select,#${ID} button{font:inherit;padding:5px 8px;border:1px solid #aaa;border-radius:4px;color:inherit;background:transparent;max-width:100%}#${ID} label{display:flex;align-items:center;gap:6px}#${ID} button{cursor:pointer}#${ID} [hidden]{display:none!important}#${ID} :focus-visible{outline:2px solid #197cff;outline-offset:2px}#${ID} [role=status]{font-size:12px} @media(prefers-color-scheme:dark){#${ID}{color:#ddd;background:#252525;border-color:#555}#${ID} select{color:#ddd;background:#252525}}`;
            (document.head || document.documentElement).appendChild(style);
            nodes[0].before(bar);
            state = { root, bar, select, cancel, message, entries: null, applied: 'original', controller: null };
            const s = state;
            select.addEventListener('change', () => { void change(s); });
            cancel.addEventListener('click', () => s.controller?.abort('cancelled'));
        }
        return { ensure, readMeta, sortEntries };
    })();


    let currentPage = null;
    function process(pageOverride) {
        const page = pageOverride || currentPage;
        if (!page) return 0;
        const root = getRoot();
        if (!root) return 0;
        DoulistSort.ensure(page);
        let added = 0;
        extractDoubanMovie(root, page).forEach(entry => {
            const mark = entry.markNode;
            if (mark.getAttribute?.(MARK_ATTR) === '1') return;
            if (mark.querySelector?.('.' + BTN_CLASS)) {
                mark.setAttribute(MARK_ATTR, '1');
                return;
            }
            if (renderActions(entry)) {
                mark.setAttribute?.(MARK_ATTR, '1');
                added++;
            }
        });
        return added;
    }

    let scheduled = false;
    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            setTimeout(() => { scheduled = false; process(); }, 120);
        });
    }

    function observe() {
        const target = getRoot();
        if (!target) return;
        const mo = new MutationObserver(muts => {
            for (const m of muts) {
                for (const n of m.addedNodes) {
                    if (n.nodeType !== 1) continue;
                    if (n.classList && n.classList.contains(BTN_CLASS)) continue; // 忽略自身插入
                    schedule();
                    return;
                }
            }
        });
        mo.observe(target, { childList: true, subtree: true });
        log('MutationObserver 已挂载于', target.id ? '#' + target.id : (target.className || target.tagName));
    }


    function detectPage() {
        if (location.hostname === 'movie.douban.com') return detectDoubanPage();
        if (['www.douban.com', 'douban.com'].includes(location.hostname) && /^\/doulist\//.test(location.pathname)) return detectDoubanPage();
        return null;
    }
    function detectDoubanPage() {
        const p = location.pathname;
        const subj = /^\/subject\/(\d+)/.exec(p);
        if (subj) return { site: 'douban', type: 'subject', id: subj[1] };
        const people = /^\/people\/[^/]+\/(wish|do|collect)(\/)?$/.exec(p);
        if (people) return { site: 'douban', type: people[1], id: null };
        if (p === '/mine' || p === '/mine/') {
            const st = new URLSearchParams(location.search).get('status');
            if (st === 'wish' || st === 'do' || st === 'collect') return { site: 'douban', type: st, id: null };
        }
        if (p === '/' || p === '') return { site: 'douban', type: 'home', id: null };   // 电影首页
        const doulist = /^\/doulist\/(\d+)/.exec(p);
        if (doulist) return { site: 'douban', type: 'doulist', id: doulist[1] };          // 片单（www.douban.com/doulist/{id}）
        return null;
    }


    function boot() {
        currentPage = detectPage();
        if (!currentPage) return;
        injectStyle(); process(); observe();
        setTimeout(process, 800); setTimeout(process, 2500);
    }
    if (detectPage()) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
        else boot();
    }
    window.__ZCW__ = {
        CONFIG, DoulistSort, preferredSearchTitle, extractTitle, resolveSearchTitle,
        sanitizeSearchTitle, MAX_SEARCH_TITLE_CHARS, buildSearchUrl, buildBilibiliKeyword,
        buildBilibiliSearchUrl, buildSoquarkSearchUrl, BILIBILI_SEARCH_URL, SOQUARK_SEARCH_URL,
        ExternalSearchAction, createButton, createBilibiliButton, createSoquarkButton,
        BILIBILI_BTN_CLASS, SOQUARK_BTN_CLASS, detectPage, detectDoubanPage,
        process, getRoot, collectAnchors, pickTitleAnchor, extractDoubanMovie,
    };
})();
