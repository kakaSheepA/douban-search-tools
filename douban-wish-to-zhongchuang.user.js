// ==UserScript==
// @name         豆瓣想看 → 搜中创
// @namespace    https://github.com/local/douban-zhongchuang
// @version      2.14.1
// @description  豆瓣三站快捷搜索（中文/英文/自定义关键词）；片单评分与年份组合筛选、全量排序及失败续载。无需本地数据存储。
// @author       Senior Developer
// @match        https://movie.douban.com/*
// @match        https://www.douban.com/doulist/*
// @match        https://douban.com/doulist/*
// @icon         https://www.douban.com/favicon.ico
// @grant        GM_openInTab
// @updateURL    https://raw.githubusercontent.com/kakaSheepA/douban-search-tools/main/douban-wish-to-zhongchuang.user.js
// @downloadURL  https://raw.githubusercontent.com/kakaSheepA/douban-search-tools/main/douban-wish-to-zhongchuang.user.js
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
    .zcw-search-btn{color:#fff!important;background:#197cff;border-color:#1567d6}
    .zcw-search-btn:hover{color:#fff!important;background:#1567d6}
    /* 注入按钮要覆盖豆瓣.title a:link/:visited的原生蓝色，实底保证独立对比度。 */
    .zcw-bilibili-btn{color:#fff!important;border-color:#b8325c!important;background:#b8325c!important}
    .zcw-bilibili-btn:hover,.zcw-bilibili-btn:focus-visible{background:#a0254c!important;border-color:#a0254c!important}
    .zcw-bilibili-btn:active{background:#8c1f42!important}
    .zcw-soquark-btn{color:#fff!important;border-color:#087f70!important;background:#087f70!important}
    .zcw-soquark-btn:hover,.zcw-soquark-btn:focus-visible{background:#06695e!important;border-color:#06695e!important}
    .zcw-soquark-btn:active{background:#05594f!important}
    .zcw-group>a::after,.zcw-group>button::after{content:none!important}
    .zcw-group>a:focus-visible,.zcw-group>button:focus-visible{outline:2px solid #197cff;outline-offset:2px}
    .zcw-keyword-edit{margin-left:8px;padding:1px 5px;font:inherit;font-size:12px;color:#666;border:0;border-bottom:1px dotted #999;background:transparent;cursor:pointer}
    .zcw-keyword-editor{position:fixed;z-index:2147483646;box-sizing:border-box;width:min(390px,calc(100vw - 24px));padding:16px;border:1px solid #bbb;border-radius:8px;background:#fff;color:#333;box-shadow:0 6px 28px #0003;font:13px/1.6 Arial,sans-serif}
    .zcw-keyword-editor h3{margin:0 0 8px;font-size:15px}
    .zcw-keyword-editor input{box-sizing:border-box;width:100%;padding:7px;margin:8px 0;font:inherit;color:inherit;background:transparent;border:1px solid #aaa;border-radius:4px}
    .zcw-keyword-editor button{padding:4px 9px;margin:0 6px 6px 0;font:inherit;cursor:pointer;color:inherit;background:transparent;border:1px solid #aaa;border-radius:4px}
    .zcw-keyword-editor button[aria-pressed=true]{color:#fff;background:#197cff;border-color:#197cff}
    .zcw-keyword-editor button:disabled{opacity:.4;cursor:default}
    .zcw-keyword-editor small{display:block;color:#777}
    .zcw-keyword-editor [role=alert]{color:#b42318}
    .zcw-keyword-editor :focus-visible{outline:2px solid #197cff;outline-offset:2px}
    [data-zcw-filter-hidden]{display:none!important}
    @media(prefers-color-scheme:dark){
        .zcw-search-btn{color:#0f1720!important;background:#8abde1;border-color:#8abde1}
        .zcw-search-btn:hover{color:#0f1720!important;background:#9ccce9}
        .zcw-bilibili-btn{color:#ffe0e9!important;border-color:#cc718d!important;background:#482631!important}
        .zcw-bilibili-btn:hover,.zcw-bilibili-btn:focus-visible{background:#663545!important;border-color:#e89ab1!important}
        .zcw-bilibili-btn:active{background:#763e50!important}
        .zcw-soquark-btn{color:#baf6e7!important;border-color:#71dac3!important;background:#18382f!important}
        .zcw-soquark-btn:hover,.zcw-soquark-btn:focus-visible{background:#214b3f!important;border-color:#9aecd9!important}
        .zcw-soquark-btn:active{background:#285b4c!important}
        .zcw-keyword-edit{color:#ccc}
        .zcw-keyword-editor{background:#252525;color:#eee;border-color:#666}
        .zcw-keyword-editor small{color:#bbb}
        .zcw-keyword-editor [role=alert]{color:#ffb4ab}
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

    function searchKeyword(title, options) {
        if (typeof title !== 'string') return '';
        return options?.literal ? title.replace(/\s+/g, ' ').trim() : preferredSearchTitle(title);
    }

    function buildSearchUrl(title, options) {
        const safe = sanitizeSearchTitle(searchKeyword(title, options));
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

    function buildBilibiliSearchUrl(title, options) {
        const keyword = searchKeyword(title, options);
        if (!keyword) return null;
        const u = new URL(BILIBILI_SEARCH_URL);
        u.searchParams.set('keyword', keyword);   // URL API 负责编码，不手动 encodeURIComponent
        return u.href;
    }

    function buildSoquarkSearchUrl(title, options) {
        const keyword = searchKeyword(title, options);
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


    function searchNames(title, raw = title) {
        const preferred = resolveSearchTitle(title);
        const chinese = HAS_CJK.test(preferred) && !/[\u3040-\u30ff]/.test(preferred) ? preferred : '';
        // 只把别名分隔斜杠拆开，Face/Off等英文片名内部斜杠保留。
        const separated = String(raw || '').replace(/\s*\/\s*/g, (slash, index, all) => {
            const neighbors = (all[index - 1] || '') + (all[index + slash.length] || '');
            return /\s/.test(slash) || /[\u4e00-\u9fa5\u3040-\u30ff]/.test(neighbors) ? '\n' : slash;
        });
        const parts = separated.split('\n').map(s => s.replace(/\s*[（(](?:\d{4}|港|台|豆瓣(?:电影)?)[）)]\s*$/, '').trim()).filter(Boolean);
        const roman = s => /[a-z]/i.test(s) && !/[\u4e00-\u9fa5\u3040-\u30ff]/.test(s);
        let english = !chinese && roman(preferred) ? preferred : parts.find(roman) || '';
        if (!english) {
            for (const part of parts) {
                const chunks = part.split(/\s+/), groups = [];
                let group = [];
                for (const token of chunks) {
                    if (/[\u4e00-\u9fa5\u3040-\u30ff]/.test(token)) {
                        if (group.length) groups.push(group); group = [];
                    } else group.push(token);
                }
                if (group.length) groups.push(group);
                for (const words of groups) {
                    while (words.length && /^(?:\d{4}|\d+[dDkK]|Re[:：])$/.test(words[0])) words.shift();
                    const candidate = words.join(' ');
                    if (roman(candidate) && !/^(?:Season|Part)\s+\d+$/i.test(candidate)) { english = candidate; break; }
                }
                if (english) break;
            }
        }
        return { auto: preferred, chinese, english };
    }

    function searchLink(title, className, text, buildUrl) {
        if (typeof title !== 'string' || !title.trim()) return null;
        const resolved = resolveSearchTitle(title), url = buildUrl(resolved);
        if (!url) return null;
        const link = document.createElement('a');
        link.className = className; link.textContent = text;
        link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.title = text + '：' + resolved; link.setAttribute('data-zcw-title', resolved);
        link.addEventListener('click', e => {
            e.stopPropagation();
            if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
            e.preventDefault(); openSearchUrl(link.href);
        });
        link.addEventListener('auxclick', e => { if (e.button === 1) e.stopPropagation(); });
        link.addEventListener('keydown', e => {
            if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
                e.preventDefault(); if (!e.repeat && !e.isComposing) link.click();
            }
        });
        return link;
    }

    let keywordEditor = null;
    function closeKeywordEditor() {
        if (!keywordEditor) return;
        const { element, onOutside, origin } = keywordEditor;
        document.removeEventListener('click', onOutside);
        element.remove(); keywordEditor = null;
        if (origin.isConnected) origin.focus();
    }

    function openKeywordEditor(context, origin) {
        closeKeywordEditor();
        const element = document.createElement('div');
        element.className = 'zcw-keyword-editor';
        element.setAttribute('role', 'dialog'); element.setAttribute('aria-label', '编辑搜索关键词');
        const heading = document.createElement('h3'); heading.textContent = '搜索关键词'; element.appendChild(heading);
        const modes = document.createElement('div'); element.appendChild(modes);
        const input = document.createElement('input'); input.type = 'text'; input.setAttribute('aria-label', '搜索关键词'); input.value = context.keyword;
        const buttons = [];
        for (const [mode, label] of [['auto', '自动'], ['chinese', '中文名'], ['english', '英文名']]) {
            const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
            button.dataset.language = mode; button.disabled = !context.names[mode];
            button.setAttribute('aria-pressed', String(context.mode === mode)); buttons.push(button);
            button.addEventListener('click', () => { input.value = context.names[mode]; buttons.forEach(b => b.setAttribute('aria-pressed', String(b === button))); input.focus(); });
            modes.appendChild(button);
        }
        element.appendChild(input);
        input.addEventListener('input', () => buttons.forEach(b => b.setAttribute('aria-pressed', 'false')));
        const hint = document.createElement('small'); hint.textContent = '只修改本条搜索词，刷新后恢复。中创仍最多18字。'; element.appendChild(hint);
        const message = document.createElement('div'); message.setAttribute('role', 'alert'); element.appendChild(message);
        const apply = document.createElement('button'); apply.type = 'button'; apply.className = 'zcw-keyword-apply'; apply.textContent = '应用';
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'zcw-keyword-cancel'; cancel.textContent = '取消';
        const commit = () => {
            const keyword = searchKeyword(input.value, { literal: true });
            if (!keyword) { message.textContent = '关键词不能为空'; input.focus(); return; }
            const urls = context.links.map(({ buildUrl }) => buildUrl(keyword, { literal: true }));
            if (urls.some(url => !url)) { message.textContent = '关键词无法用于中创搜索，请输入有效片名'; input.focus(); return; }
            context.keyword = keyword;
            context.mode = buttons.find(b => b.getAttribute('aria-pressed') === 'true')?.dataset.language || 'manual';
            context.links.forEach(({ link }, index) => {
                link.href = urls[index]; link.setAttribute('data-zcw-title', keyword);
                link.title = link.textContent + '：' + keyword;
            });
            origin.title = '当前关键词：' + keyword;
            closeKeywordEditor();
        };
        apply.addEventListener('click', commit); cancel.addEventListener('click', closeKeywordEditor);
        element.addEventListener('keydown', e => {
            if (e.isComposing || e.keyCode === 229) return;
            if (e.key === 'Escape') { e.preventDefault(); closeKeywordEditor(); }
            else if (e.key === 'Enter' && e.target === input) { e.preventDefault(); commit(); }
        });
        element.append(apply, cancel); document.body.appendChild(element);
        const rect = origin.getBoundingClientRect();
        element.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - 402)) + 'px';
        element.style.top = Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - element.offsetHeight - 12)) + 'px';
        const onOutside = e => { if (!element.contains(e.target) && e.target !== origin) closeKeywordEditor(); };
        document.addEventListener('click', onOutside);
        keywordEditor = { element, onOutside, origin }; input.focus();
    }

    function createButton(title, doubanId, names = searchNames(title)) {
        const resolved = resolveSearchTitle(title);
        if (!buildSearchUrl(resolved)) return null;
        const group = document.createElement('span');
        group.className = 'zcw-group';
        const context = { names, keyword: resolved, mode: 'auto', links: [] };
        for (const [className, text, buildUrl] of [[BTN_CLASS, CONFIG.BUTTON_TEXT, buildSearchUrl], [BILIBILI_BTN_CLASS, CONFIG.BILIBILI_BUTTON_TEXT, buildBilibiliSearchUrl], [SOQUARK_BTN_CLASS, CONFIG.SOQUARK_BUTTON_TEXT, buildSoquarkSearchUrl]]) {
            const link = searchLink(resolved, className, text, buildUrl);
            if (doubanId) link.setAttribute('data-zcw-id', doubanId);
            context.links.push({ link, buildUrl }); group.appendChild(link);
        }
        const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'zcw-keyword-edit'; edit.textContent = '关键词';
        edit.title = '编辑搜索关键词'; edit.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openKeywordEditor(context, edit); });
        group.appendChild(edit);
        return group;
    }
    function createBilibiliButton(title) {
        return searchLink(title, BILIBILI_BTN_CLASS, CONFIG.BILIBILI_BUTTON_TEXT, buildBilibiliSearchUrl);
    }
    function createSoquarkButton(title) {
        return searchLink(title, SOQUARK_BTN_CLASS, CONFIG.SOQUARK_BUTTON_TEXT, buildSoquarkSearchUrl);
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
            const raw = [titleAnchor.textContent, titleAnchor.getAttribute('title'), titleAnchor.querySelector('img')?.alt].filter(s => s?.trim()).join(' / ') || title;
            entries.push({ doubanId, title, names: searchNames(title, raw), titleAnchor, markNode: box, mount: titleAnchor, mountMode: 'list' });
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
        const raw = h1?.textContent || document.title;
        return [{ doubanId: page.id, title, names: searchNames(title, raw), titleAnchor: h1 || mount, markNode: mount, mount: mount, mountMode: 'after' }];
    }


    function renderActions(entry) {
        const group = createButton(entry.title, entry.doubanId, entry.names);
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

        function sameNodes(root, nodes) {
            const current = new Set(items(root));
            return current.size === nodes.length && nodes.every(n => current.has(n));
        }

        function readFilters(s) {
            const read = name => {
                const text = s.inputs[name].value.trim();
                if (!text) return null;
                const n = Number(text);
                if (!Number.isFinite(n)) throw new Error('请输入有效的筛选数字');
                return n;
            };
            const filters = { ratingMin: read('ratingMin'), yearFrom: read('yearFrom'), yearTo: read('yearTo') };
            if (filters.ratingMin !== null && (filters.ratingMin < 0 || filters.ratingMin > 10)) throw new Error('评分应在0到10之间');
            for (const n of [filters.yearFrom, filters.yearTo]) {
                if (n !== null && (!Number.isInteger(n) || n < 1000 || n > 9999)) throw new Error('年份应为四位整数');
            }
            if (filters.yearFrom !== null && filters.yearTo !== null && filters.yearFrom > filters.yearTo) throw new Error('起始年份不能大于结束年份');
            return filters;
        }

        function matchesFilter(meta, filters) {
            if (Object.values(filters).every(n => n === null)) return true;
            if (!meta.movie) return false;
            if (filters.ratingMin !== null && (meta.rating === null || meta.rating < filters.ratingMin)) return false;
            if (filters.yearFrom !== null && (meta.year === null || meta.year < filters.yearFrom)) return false;
            if (filters.yearTo !== null && (meta.year === null || meta.year > filters.yearTo)) return false;
            return true;
        }

        async function collect(s, signal, controller) {
            if (!s.pending) {
                const first = safePageUrl(location.href); first.searchParams.set('start', '0');
                const initial = items(s.root);
                s.pending = { next: first.href, expected: pageCount(s.root), pages: 0, visited: new Set(),
                    signatures: new Set(), entries: [], initial, local: new Map(initial.map(n => [itemKey(n), n])) };
            }
            const p = s.pending;
            if (!sameNodes(s.root, p.initial)) throw new Error('片单条目发生变化，请刷新后重新加载');
            while (p.next) {
                if (signal.aborted) throw new Error('cancelled');
                const next = safePageUrl(p.next);
                const offset = pageKey(next);
                if (p.visited.has(offset) || p.pages >= 1000) throw new Error('分页重复或页数异常');
                let root;
                if (offset === pageKey(new URL(location.href))) {
                    root = s.root;
                } else {
                    if (p.pages) await pause(signal);
                    s.message.textContent = `正在加载第 ${p.pages + 1} 页（已读取 ${p.entries.filter(e => e.meta.movie).length} 部影视）…`;
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
                if (!nodes.length || p.signatures.has(signature)) throw new Error('分页内容为空或重复');
                const expected = Math.max(p.expected, pageCount(root));
                const href = root.querySelector('.paginator .next a[href], .paginator a[rel="next"], .paginator link[rel="next"]')?.getAttribute('href');
                const following = href ? safePageUrl(new URL(href, next.href).href) : null;
                if (following && (pageKey(following) <= offset || p.visited.has(pageKey(following)))) throw new Error('分页重复或顺序异常');
                if (!following && p.pages + 1 < expected) throw new Error('分页不完整，请刷新后重试');
                if (!sameNodes(s.root, p.initial)) throw new Error('片单条目发生变化，请刷新后重新加载');
                // 验证完一整页再保存检查点；失败页没有被标为已完成。
                nodes.forEach(n => {
                    const node = p.local.get(itemKey(n)) || importItem(n, next.href);
                    p.entries.push({ node, meta: readMeta(node), order: p.entries.length, wasHidden: node.hidden });
                });
                p.visited.add(offset); p.signatures.add(signature); p.pages++; p.expected = expected;
                p.next = following?.href || null;
                s.message.textContent = `已读取 ${p.pages} / ${p.expected} 页（${p.entries.filter(e => e.meta.movie).length} 部影视）…`;
            }
            return p.entries;
        }

        function render(s, mode, filters = s.filters) {
            const list = sortEntries(s.entries, mode);
            const old = items(s.root);
            const marker = document.createComment('zcw-doulist-items');
            old[0].before(marker);
            old.forEach(n => n.remove());
            const fragment = document.createDocumentFragment();
            list.forEach(e => {
                const excluded = !matchesFilter(e.meta, filters);
                e.node.hidden = !!e.wasHidden || excluded;
                e.node.toggleAttribute('data-zcw-filter-hidden', excluded);
                fragment.appendChild(e.node);
            });
            marker.replaceWith(fragment);
            s.root.querySelectorAll('.paginator').forEach(el => { el.hidden = true; });
            s.applied = mode; s.select.value = mode; s.filters = filters;
            const total = s.entries.filter(e => e.meta.movie).length;
            const visible = s.entries.filter(e => e.meta.movie && !e.node.hidden).length;
            s.message.textContent = `已加载完整片单：${total} 部影视 · 当前显示 ${visible} 部 · ${MODES.find(m => m[0] === mode)[1]}`;
            process();
        }

        async function change(s, forceLoad = false, requestedMode = s.select.value) {
            const mode = requestedMode;
            if (!MODES.some(m => m[0] === mode) || s.controller) return;
            let filters;
            try { filters = readFilters(s); } catch (e) { s.message.textContent = e.message; s.select.value = s.applied; return; }
            if (s.entries) {
                if (!sameNodes(s.root, s.entries.map(e => e.node))) {
                    s.select.value = s.applied;
                    s.message.textContent = '片单条目发生变化，请刷新页面后重新加载排序。';
                    return;
                }
                s.entries.forEach(e => { e.meta = readMeta(e.node); });
                render(s, mode, filters);
                return;
            }
            if (mode === 'original' && !forceLoad && !s.pending && Object.values(filters).every(n => n === null)) return;
            const controller = new AbortController();
            s.requestedMode = mode;
            s.controller = controller;
            s.bar.setAttribute('aria-busy', 'true');
            s.select.disabled = true;
            s.cancel.hidden = false;
            s.resume.hidden = true;
            [...Object.values(s.inputs), s.apply, s.clear].forEach(el => { el.disabled = true; });
            s.message.textContent = '正在加载完整片单…';
            try {
                const entries = await collect(s, controller.signal, controller);
                if (controller.signal.aborted) throw new Error('cancelled');
                if (!sameNodes(s.root, s.pending.initial)) throw new Error('片单条目发生变化，请刷新后重新加载');
                s.entries = entries;
                s.pending = null;
                render(s, mode, filters);
            } catch (e) {
                s.select.value = s.applied;
                const reason = controller.signal.reason;
                s.message.textContent = controller.signal.aborted && reason !== 'timeout'
                    ? '已取消，保留原列表和已读取分页，可继续加载。'
                    : '加载失败：' + (reason === 'timeout' ? '请求超时' : e.message) + '。保留原列表和已读取分页。';
            } finally {
                s.controller = null;
                s.bar.setAttribute('aria-busy', 'false');
                s.select.disabled = false;
                s.cancel.hidden = true;
                s.resume.hidden = !s.pending;
                [...Object.values(s.inputs), s.apply, s.clear].forEach(el => { el.disabled = false; });
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
            cancel.type = 'button'; cancel.className = 'zcw-load-cancel'; cancel.textContent = '取消加载'; cancel.hidden = true;
            const resume = document.createElement('button');
            resume.type = 'button'; resume.className = 'zcw-load-resume'; resume.textContent = '继续加载'; resume.hidden = true;
            const message = document.createElement('span');
            message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
            message.textContent = '选择排序后加载全部分页；上映时间按年份。';
            bar.append(label, cancel, resume, message);
            const filterBar = document.createElement('div'); filterBar.className = 'zcw-filter-controls';
            filterBar.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;width:100%';
            const inputs = {};
            for (const [name, text, min, max, step] of [['ratingMin', '评分 ≥', 0, 10, 0.1], ['yearFrom', '年份从', 1000, 9999, 1], ['yearTo', '到', 1000, 9999, 1]]) {
                const field = document.createElement('label'); field.textContent = text;
                const input = document.createElement('input'); input.type = 'number'; input.name = name;
                input.min = String(min); input.max = String(max); input.step = String(step);
                input.setAttribute('aria-label', name === 'ratingMin' ? '最低评分' : name === 'yearFrom' ? '起始年份' : '结束年份');
                input.style.cssText = 'box-sizing:border-box;width:84px;padding:5px;border:1px solid #aaa;border-radius:4px;font:inherit;color:inherit;background:transparent';
                inputs[name] = input; field.appendChild(input); filterBar.appendChild(field);
            }
            const apply = document.createElement('button'); apply.type = 'button'; apply.className = 'zcw-filter-apply'; apply.textContent = '应用筛选';
            const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'zcw-filter-clear'; clear.textContent = '清空筛选';
            filterBar.append(apply, clear); bar.appendChild(filterBar);
            const style = document.createElement('style');
            style.textContent = `#${ID}{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:12px;margin:12px 0;border:1px solid #ddd;border-radius:4px;background:#f7f9fb;font-size:13px;color:#555}#${ID} select,#${ID} button{font:inherit;padding:5px 8px;border:1px solid #aaa;border-radius:4px;color:inherit;background:transparent;max-width:100%}#${ID} label{display:flex;align-items:center;gap:6px}#${ID} button{cursor:pointer}#${ID} [hidden]{display:none!important}#${ID} :focus-visible{outline:2px solid #197cff;outline-offset:2px}#${ID} [role=status]{font-size:12px} @media(prefers-color-scheme:dark){#${ID}{color:#ddd;background:#252525;border-color:#555}#${ID} select{color:#ddd;background:#252525}}`;
            (document.head || document.documentElement).appendChild(style);
            nodes[0].before(bar);
            state = { root, bar, select, cancel, resume, message, inputs, apply, clear, entries: null, pending: null,
                filters: { ratingMin: null, yearFrom: null, yearTo: null }, applied: 'original', requestedMode: 'original', controller: null };
            const s = state;
            select.addEventListener('change', () => { void change(s); });
            cancel.addEventListener('click', () => s.controller?.abort('cancelled'));
            resume.addEventListener('click', () => { void change(s, true, s.requestedMode); });
            apply.addEventListener('click', () => { void change(s, true); });
            Object.values(inputs).forEach(input => input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); void change(s, true); } }));
            clear.addEventListener('click', () => {
                Object.values(inputs).forEach(input => { input.value = ''; });
                if (s.entries) void change(s);
                else s.message.textContent = '已清空筛选，选择排序或应用筛选后加载完整片单。';
            });
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
