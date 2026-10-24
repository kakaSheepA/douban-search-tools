// ==UserScript==
// @name         豆瓣想看 → 搜中创
// @namespace    https://github.com/local/douban-zhongchuang
// @version      2.17.0
// @description  豆瓣电影关系图谱、三站搜索、IMDb/TMDB及自定义站点；复制片名、年份季数开关、片单筛选排序与失败续载。仅保存自定义站点设置。
// @author       Senior Developer
// @match        https://movie.douban.com/*
// @match        https://www.douban.com/doulist/*
// @match        https://douban.com/doulist/*
// @icon         https://www.douban.com/favicon.ico
// @grant        GM_openInTab
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      movie.douban.com
// @connect      www.douban.com
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
    .zcw-more-toggle{margin-left:8px;padding:1px 9px;font:600 12px/17px Arial,sans-serif;color:#334155!important;background:#f1f5f9!important;border:1px solid #94a3b8;border-radius:4px;cursor:pointer;vertical-align:middle;white-space:nowrap}
    .zcw-more-menu{position:fixed;z-index:2147483646;box-sizing:border-box;width:224px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto;padding:8px;border:1px solid #94a3b8;border-radius:7px;background:#fff;color:#243247;box-shadow:0 5px 24px #0003;font:13px/1.6 Arial,sans-serif}
    .zcw-more-menu button{display:block;width:100%;box-sizing:border-box;padding:7px 9px;border:0;border-radius:4px;text-align:left;font:inherit;color:inherit;background:transparent;cursor:pointer}
    .zcw-more-menu button:hover,.zcw-more-menu button:focus-visible{background:#e2e8f0;outline:2px solid #197cff;outline-offset:-2px}
    .zcw-more-menu button[aria-pressed=true]::before{content:'✓ ';font-weight:bold}
    .zcw-more-menu button:disabled{opacity:.5;cursor:default}
    .zcw-more-status{padding:0 9px;font-size:12px}
    .zcw-more-menu a{display:block;box-sizing:border-box;padding:7px 9px;border-radius:4px;font:inherit;color:#243247!important;background:transparent!important;text-decoration:none!important}
    .zcw-more-menu a:hover,.zcw-more-menu a:focus-visible{background:#e2e8f0!important;outline:2px solid #197cff;outline-offset:-2px}
    .zcw-settings-backdrop{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:12px;background:#0007}
    .zcw-site-settings{box-sizing:border-box;width:560px;max-width:100%;max-height:calc(100vh - 24px);overflow:auto;padding:20px;border:1px solid #94a3b8;border-radius:8px;background:#fff;color:#243247;box-shadow:0 8px 36px #0004;font:13px/1.6 Arial,sans-serif}
    .zcw-site-settings h3{font-size:17px;margin:0 0 8px}
    .zcw-site-settings p{margin:8px 0}
    .zcw-site-settings label{display:block;margin:8px 0}
    .zcw-site-settings input:not([type=checkbox]){display:block;box-sizing:border-box;width:100%;padding:8px;font:inherit;color:inherit;background:transparent;border:1px solid #94a3b8;border-radius:4px}
    .zcw-site-settings button{padding:6px 10px;margin:4px 6px 4px 0;font:inherit;border:1px solid #94a3b8;border-radius:4px;background:#f1f5f9;color:#243247;cursor:pointer}
    .zcw-site-settings button:disabled{opacity:.45;cursor:default}
    .zcw-site-settings :focus-visible{outline:2px solid #197cff;outline-offset:2px}
    .zcw-site-row{display:flex;gap:4px;align-items:center;flex-wrap:wrap;border-bottom:1px solid #94a3b8;padding:5px 0}
    .zcw-site-row label{flex:1 1 120px;overflow-wrap:anywhere}
    .zcw-site-row button{padding:4px 7px;margin-right:0}
    .zcw-site-settings [role=alert]{color:#b42318}
    .zcw-site-footer{margin-top:12px}
    .zcw-graph{--g-bg:#f4f7fc;--g-panel:#fff;--g-text:#1e293b;--g-muted:#52647b;--g-line:#c7d3e3;position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;box-sizing:border-box;height:100vh;height:100dvh;color:var(--g-text);background:var(--g-bg);font:14px/1.5 Arial,sans-serif;text-align:left}
    .zcw-graph *{box-sizing:border-box}
    .zcw-graph button{font:inherit;color:var(--g-text);background:var(--g-panel);border:1px solid var(--g-line);border-radius:7px;padding:7px 12px;cursor:pointer}
    .zcw-graph button:disabled{opacity:.55;cursor:default}
    .zcw-graph button:hover:not(:disabled){border-color:#3267d6;background:var(--g-bg)}
    .zcw-graph a{color:#245ec7!important;background:transparent!important;text-decoration:none!important;overflow-wrap:anywhere}
    .zcw-graph a:hover{text-decoration:underline!important}
    .zcw-graph :focus-visible{outline:2px solid #3267d6;outline-offset:2px}
    .zcw-graph-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 24px;background:var(--g-panel);border-bottom:1px solid var(--g-line);flex:none}
    .zcw-graph-header strong{font-size:21px;letter-spacing:.5px}
    .zcw-graph-header small{display:block;font-size:12px;color:var(--g-muted);margin-top:3px}
    .zcw-graph-body{display:grid;grid-template-columns:minmax(0,1fr) 300px;flex:1;min-height:0;overflow:hidden}
    .zcw-graph-canvas{position:relative;min-height:0;min-width:0;overflow:hidden;background:radial-gradient(circle,var(--g-line) .7px,transparent .8px) 0 0/22px 22px}
    .zcw-graph-tools{position:absolute;top:12px;left:16px;right:16px;z-index:1;display:flex;align-items:center;gap:6px;flex-wrap:wrap;color:#245ec7;font-size:12px}
    .zcw-graph-tools>span{margin-right:auto;background:var(--g-panel);padding:6px 10px;border-radius:7px}
    .zcw-graph-tools button{padding:5px 10px}
    .zcw-graph-person-legend{color:#8a418d}
    .zcw-graph-svg{display:block;width:100%;height:100%;min-height:260px;touch-action:none;cursor:grab}
    .zcw-graph-svg:active{cursor:grabbing}
    .zcw-graph-edge{stroke:var(--g-line);stroke-width:2}
    .zcw-graph-edge.is-active{stroke:#7095cf;stroke-width:2.5}
    .zcw-graph-edge-label{fill:var(--g-muted);font-size:12px;paint-order:stroke;stroke:var(--g-bg);stroke-width:5px;stroke-linejoin:round}
    .zcw-graph-node{cursor:pointer}
    .zcw-graph-node circle{fill:#e0eaff;stroke:#3267d6;stroke-width:2}
    .zcw-graph-node.person circle{fill:#f2dff4;stroke:#98509b}
    .zcw-graph-node.is-selected circle{stroke-width:5;filter:drop-shadow(0 3px 7px #3267d644)}
    .zcw-graph-symbol{fill:#245ec7;font-size:19px;font-weight:bold;pointer-events:none}
    .zcw-graph-node.person .zcw-graph-symbol{fill:#8a418d}
    .zcw-graph-name{fill:var(--g-text);font-size:15px;font-weight:600;paint-order:stroke;stroke:var(--g-bg);stroke-width:4px;stroke-linejoin:round}
    .zcw-graph-help{position:absolute;left:12px;bottom:8px;max-width:calc(100% - 24px);padding:5px 9px;margin:0;color:var(--g-muted);background:var(--g-panel);border-radius:5px;font-size:11px;pointer-events:none}
    .zcw-graph-side{background:var(--g-panel);border-left:1px solid var(--g-line);padding:18px;overflow:auto;min-height:0}
    .zcw-graph-detail h2{margin:4px 0 12px;font-size:21px;line-height:1.4;overflow-wrap:anywhere}
    .zcw-graph-kind{color:var(--g-muted);font-size:12px}
    .zcw-graph-source{display:block;margin-top:12px;font-size:12px}
    .zcw-graph-relations{list-style:none;padding:0;margin:16px 0;font-size:12px;max-height:170px;overflow:auto}
    .zcw-graph-relations li{padding:5px 0;border-bottom:1px solid var(--g-line)}
    .zcw-graph summary{padding:10px 0;color:var(--g-muted);cursor:pointer;font-size:12px}
    .zcw-graph-list{display:flex;flex-direction:column;gap:5px}
    .zcw-graph-list button{text-align:left;font-size:12px;overflow-wrap:anywhere}
    .zcw-graph-list button[aria-pressed=true]{border-color:#3267d6;background:var(--g-bg);font-weight:bold}
    .zcw-graph footer{flex:none;border-top:1px solid var(--g-line);background:var(--g-panel);padding:10px 24px}
    .zcw-graph-status{font-size:13px;min-height:20px}
    .zcw-graph-note{color:var(--g-muted);font-size:11px;margin-top:3px}
    @media(max-width:700px){.zcw-graph-header{padding:12px}.zcw-graph-header strong{font-size:18px}.zcw-graph-header small{font-size:10px}.zcw-graph-body{grid-template-columns:1fr;grid-template-rows:minmax(260px,1.15fr) minmax(150px,.85fr);overflow:auto}.zcw-graph-side{border-left:0;border-top:1px solid var(--g-line);padding:12px}.zcw-graph footer{padding:8px 12px}.zcw-graph-tools{left:8px;right:8px;top:8px}.zcw-graph-help{font-size:10px}.zcw-graph-canvas{min-height:260px}}
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
        .zcw-more-toggle{color:#f1f5f9!important;background:#334155!important;border-color:#94a3b8}
        .zcw-more-menu{background:#202b3b;color:#f1f5f9}
        .zcw-more-menu button:hover,.zcw-more-menu button:focus-visible{background:#334155}
        .zcw-more-menu a{color:#f1f5f9!important}
        .zcw-more-menu a:hover,.zcw-more-menu a:focus-visible{background:#334155!important}
        .zcw-site-settings{background:#202b3b;color:#f1f5f9}
        .zcw-site-settings button{background:#334155;color:#f1f5f9}
        .zcw-site-settings [role=alert]{color:#ffb4ab}
        .zcw-graph{--g-bg:#111c2e;--g-panel:#1c2a40;--g-text:#e6edf8;--g-muted:#acbdd6;--g-line:#3c506e}
        .zcw-graph a{color:#a9caff!important}
        .zcw-graph-tools{color:#a9caff}
        .zcw-graph-person-legend{color:#e5b7e8}
        .zcw-graph-node circle{fill:#203e70;stroke:#8bb8ff}
        .zcw-graph-node.person circle{fill:#513054;stroke:#e1a9e6}
        .zcw-graph-symbol{fill:#c5daff}
        .zcw-graph-node.person .zcw-graph-symbol{fill:#f4d5f6}
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

    const MovieGraph = (() => {
        const MAX_NODES = 80, NS = 'http://www.w3.org/2000/svg';
        let active = null;
        const text = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 100);
        function normalizeUrl(value, base = location.href) {
            try {
                const u = new URL(value, base);
                if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
                let m;
                if (u.hostname === 'movie.douban.com' && (m = /^\/subject\/(\d+)\/?$/.exec(u.pathname))) return { id: 'movie:' + m[1], type: 'movie', url: 'https://movie.douban.com/subject/' + m[1] + '/' };
                if (u.hostname === 'movie.douban.com' && (m = /^\/celebrity\/(\d+)(?:\/(movies))?\/?$/.exec(u.pathname))) return { id: 'person:celebrity:' + m[1], type: 'person', works: !!m[2], url: 'https://movie.douban.com/celebrity/' + m[1] + (m[2] ? '/movies' : '/') };
                if (u.hostname === 'www.douban.com' && (m = /^\/personage\/(\d+)(?:\/(creations))?\/?$/.exec(u.pathname))) return { id: 'person:personage:' + m[1], type: 'person', works: !!m[2], url: 'https://www.douban.com/personage/' + m[1] + (m[2] ? '/creations' : '/') };
            } catch (_) { /* 不支持的链接不会请求 */ }
            return null;
        }
        function pageTitle(doc) { return text(doc.querySelector('h1 [property="v:itemreviewed"]')?.textContent || doc.querySelector('#content h1,h1')?.textContent); }
        function parseMovie(doc, url) {
            const root = normalizeUrl(url), title = pageTitle(doc);
            if (!root || root.type !== 'movie' || !title || !doc.querySelector('#info,#recommendations,#celebrities')) throw Error('未找到影片资料，页面可能需要登录或验证');
            const node = { ...root, title: resolveSearchTitle(title) || title }, nodes = new Map([[root.id, node]]), edges = [];
            const add = (a, relation, type) => {
                const target = normalizeUrl(a.getAttribute('href'), url);
                const title = text(a.textContent || a.getAttribute('title') || a.querySelector('img')?.alt);
                if (!target || target.type !== type || !title || target.id === root.id) return;
                nodes.set(target.id, { ...target, title });
                if (!edges.some(e => e.target === target.id && e.relation === relation)) edges.push({ source: root.id, target: target.id, relation, url: root.url });
            };
            const info = doc.querySelector('#info');
            if (info) {
                info.querySelectorAll('a[rel="v:directedBy"]').forEach(a => add(a, '导演', 'person'));
                [...info.querySelectorAll('a[rel="v:starring"]')].slice(0, 8).forEach(a => add(a, '主演', 'person'));
                for (const span of info.querySelectorAll('span')) {
                    const label = text(span.querySelector('.pl')?.textContent).replace(/[:：]$/, '');
                    if (label === '导演' || label === '主演') [...span.querySelectorAll('a[href]')].slice(0, label === '主演' ? 8 : 4).forEach(a => add(a, label, 'person'));
                }
            }
            [...doc.querySelectorAll('#celebrities .celebrity')].slice(0, 12).forEach(card => {
                const a = card.querySelector('.name a[href],a.name[href]');
                const role = text(card.querySelector('.role')?.textContent);
                if (a && /导演|演员|饰/.test(role)) add(a, /导演/.test(role) ? '导演' : '主演', 'person');
            });
            [...doc.querySelectorAll('#recommendations dl')].slice(0, 8).forEach(dl => { const a = dl.querySelector('dd a[href],dt a[href]'); if (a) add(a, '豆瓣推荐', 'movie'); });
            return { nodes: [...nodes.values()], edges };
        }
        function parsePerson(doc, url) {
            const root = normalizeUrl(url), title = pageTitle(doc);
            if (!root || root.type !== 'person' || !title) throw Error('未找到人物资料，页面可能需要登录或验证');
            const nodes = new Map([[root.id, { ...root, title }]]), edges = [];
            const area = root.works ? doc.querySelector('#content .article,#content') : doc.querySelector('#recent_movies,.works-list,.creations,.list-view,.grid_view');
            if (area) for (const a of area.querySelectorAll('a[href]')) {
                if (a.closest('.aside,.comment,.comments,.recommendations,blockquote')) continue;
                const target = normalizeUrl(a.getAttribute('href'), url);
                const title = text(a.getAttribute('title') || a.querySelector('img')?.alt || a.textContent);
                if (!target || target.type !== 'movie' || !title || nodes.has(target.id)) continue;
                nodes.set(target.id, { ...target, title: resolveSearchTitle(title) || title });
                edges.push({ source: root.id, target: target.id, relation: '人物页作品', url: root.url });
            }
            let worksUrl = '';
            if (!root.works && !edges.length) for (const a of doc.querySelectorAll('#content a[href]')) {
                const target = normalizeUrl(a.getAttribute('href'), url);
                if (target?.id === root.id && target.works) { worksUrl = target.url; break; }
            }
            if (!root.works && !edges.length && !worksUrl && root.id.startsWith('person:celebrity:')) worksUrl = root.url.replace(/\/$/, '') + '/movies';
            return { nodes: [...nodes.values()], edges, worksUrl };
        }
        function fetchPage(s, url) {
            const expected = normalizeUrl(url);
            if (!expected) return Promise.reject(Error('不支持的关系页面地址'));
            return new Promise((resolve, reject) => {
                if (typeof GM_xmlhttpRequest !== 'function') { reject(Error('请更新油猴脚本并确认读取豆瓣关系页面的权限')); return; }
                let done = false;
                const finish = (error, doc) => {
                    if (done) return; done = true; s.cancel = null;
                    if (error) reject(error); else resolve(doc);
                };
                const request = GM_xmlhttpRequest({ method: 'GET', url: expected.url, timeout: 20000,
                    onload: response => {
                        const final = normalizeUrl(response.finalUrl || expected.url);
                        if (!final || final.id !== expected.id || final.works !== expected.works) { finish(Error('豆瓣返回验证或跳转页面，请在原页面处理后重试')); return; }
                        if (response.status !== 200) { finish(Error('豆瓣页面读取失败（HTTP ' + response.status + '）')); return; }
                        const html = response.responseText;
                        if (typeof html !== 'string' || html.length > 2500000) { finish(Error('页面内容无效或过大')); return; }
                        const doc = new DOMParser().parseFromString(html, 'text/html');
                        if (doc.querySelector('form[action*="captcha"],input[name=captcha-solution],#captcha_image') || /验证|验证码|captcha/i.test(doc.title)) { finish(Error('豆瓣需要验证，请打开原页面处理后再重试')); return; }
                        finish(null, doc);
                    },
                    onerror: () => finish(Error('网络读取失败，可打开原页面检查后重试')),
                    ontimeout: () => finish(Error('读取超时，可点击展开重试')),
                    onabort: () => finish(Error('已取消加载')),
                });
                if (!done) s.cancel = () => { finish(Error('已取消加载')); request?.abort(); };
            });
        }
        function merge(s, data) {
            for (const node of data.nodes) {
                if (!s.nodes.has(node.id) && s.nodes.size >= MAX_NODES) { s.limited = true; continue; }
                if (!s.nodes.has(node.id)) s.nodes.set(node.id, node);
            }
            for (const edge of data.edges) {
                const key = edge.source + '|' + edge.target + '|' + edge.relation;
                if (s.nodes.has(edge.source) && s.nodes.has(edge.target) && !s.edges.has(key)) s.edges.set(key, edge);
            }
        }
        async function expand(s) {
            if (active !== s || s.busy) return;
            const node = s.nodes.get(s.selected);
            if (s.expanded.has(node.id)) { s.message = '已展示该节点的本页可用关系'; render(s); return; }
            if (s.nodes.size >= MAX_NODES) { s.limited = true; render(s); return; }
            s.busy = true; s.message = '正在读取「' + node.title + '」的关系…'; render(s);
            let changed = false;
            try {
                let doc;
                const here = normalizeUrl(location.href);
                if (node.type === 'movie' && here?.id === node.id && document.querySelector('#info,#recommendations,#celebrities')) doc = document;
                else doc = await fetchPage(s, node.url);
                if (active !== s) return;
                let data = node.type === 'movie' ? parseMovie(doc, node.url) : parsePerson(doc, node.url);
                if (data.worksUrl) { const worksDoc = await fetchPage(s, data.worksUrl); if (active !== s) return; data = parsePerson(worksDoc, data.worksUrl); }
                const previousSize = s.nodes.size;
                merge(s, data); s.expanded.add(node.id); changed = s.nodes.size !== previousSize;
                s.message = data.edges.length ? '已展开「' + node.title + '」，新增或合并 ' + data.edges.length + ' 条来源关系' : '该页面未提供可识别的关系，可打开原页面查看';
            } catch (e) { if (active === s) s.message = e.message; }
            finally { if (active === s) { s.busy = false; render(s); if (changed) fit(s, true); } }
        }
        function svgElement(tag, attrs, content) {
            const el = document.createElementNS(NS, tag);
            for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
            if (content !== undefined) el.textContent = content;
            return el;
        }
        function positions(s) {
            const distance = new Map([[s.root, 0]]), queue = [s.root];
            for (let i = 0; i < queue.length; i++) for (const e of s.edges.values()) {
                const other = e.source === queue[i] ? e.target : e.target === queue[i] ? e.source : null;
                if (other && !distance.has(other)) { distance.set(other, distance.get(queue[i]) + 1); queue.push(other); }
            }
            const layers = new Map(), points = new Map([[s.root, { x: 0, y: 0 }]]);
            for (const id of s.nodes.keys()) if (id !== s.root) { const d = distance.get(id) || 1; if (!layers.has(d)) layers.set(d, []); layers.get(d).push(id); }
            for (const [d, ids] of layers) ids.forEach((id, i) => {
                const angle = i / ids.length * Math.PI * 2 - Math.PI / 2;
                const radius = Math.max(d * 180, ids.length * 24);
                points.set(id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
            });
            return points;
        }
        function applyView(s) {
            s.width = s.svg.clientWidth || 1000; s.height = s.svg.clientHeight || 700;
            s.svg.setAttribute('viewBox', '0 0 ' + s.width + ' ' + s.height);
            s.world.setAttribute('transform', 'translate(' + s.view.x + ',' + s.view.y + ') scale(' + s.view.scale + ')');
        }
        function fit(s, readable = false) {
            const points = positions(s), pts = [...points.values()], extent = Math.max(180, ...pts.map(p => Math.max(Math.abs(p.x), Math.abs(p.y)) + 85));
            const width = s.svg.clientWidth || 1000, height = s.svg.clientHeight || 700;
            const scale = Math.max(readable ? .8 : .12, Math.min(1, (Math.min(width, height) - 80) / (extent * 2)));
            const center = readable ? points.get(s.selected) : { x: 0, y: 0 };
            s.view = { x: width / 2 - center.x * scale, y: height / 2 - center.y * scale, scale }; applyView(s);
        }
        function select(s, id) { if (s.busy) return; s.selected = id; render(s); }
        function render(s) {
            if (active !== s) return;
            const focusedNode = document.activeElement?.dataset.graphNode;
            const pts = positions(s), selected = s.nodes.get(s.selected);
            s.edgeLayer.replaceChildren();
            const visualEdges = new Map();
            for (const edge of s.edges.values()) {
                const pair = [edge.source, edge.target].sort().join('|');
                if (!visualEdges.has(pair)) visualEdges.set(pair, { ...edge, labels: new Set() });
                visualEdges.get(pair).labels.add(edge.relation);
            }
            for (const edge of visualEdges.values()) {
                const from = pts.get(edge.source), to = pts.get(edge.target);
                const relevant = edge.source === s.selected || edge.target === s.selected;
                s.edgeLayer.appendChild(svgElement('line', { x1: from.x, y1: from.y, x2: to.x, y2: to.y, class: 'zcw-graph-edge' + (relevant ? ' is-active' : '') }));
                if (relevant) s.edgeLayer.appendChild(svgElement('text', { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 6, class: 'zcw-graph-edge-label', 'text-anchor': 'middle' }, [...edge.labels].join(' / ')));
            }
            for (const node of s.nodes.values()) {
                const p = pts.get(node.id);
                let g = s.nodeViews.get(node.id);
                if (!g) {
                    g = svgElement('g', { role: 'button', tabindex: '-1', 'aria-label': node.title });
                    g.append(svgElement('circle', { r: node.id === s.root ? 38 : 29 }), svgElement('text', { y: 5, 'text-anchor': 'middle', class: 'zcw-graph-symbol' }, node.type === 'movie' ? '影' : '人'), svgElement('text', { y: 57, 'text-anchor': 'middle', class: 'zcw-graph-name' }, node.title.length > 14 ? node.title.slice(0, 13) + '…' : node.title));
                    g.appendChild(svgElement('title', {}, node.title));
                    g.addEventListener('click', () => select(s, node.id));
                    g.addEventListener('dblclick', () => { if (!s.busy) { s.selected = node.id; expand(s); } });
                    s.nodeViews.set(node.id, g); s.nodeLayer.appendChild(g);
                }
                g.setAttribute('transform', 'translate(' + p.x + ',' + p.y + ')');
                g.setAttribute('class', 'zcw-graph-node ' + node.type + (node.id === s.selected ? ' is-selected' : ''));
            }
            s.list.replaceChildren();
            for (const node of s.nodes.values()) {
                const b = document.createElement('button'); b.type = 'button'; b.dataset.graphNode = node.id;
                b.textContent = (node.type === 'movie' ? '影片 · ' : '人物 · ') + node.title;
                b.setAttribute('aria-pressed', String(node.id === s.selected));
                b.disabled = s.busy; b.addEventListener('click', () => select(s, node.id)); s.list.appendChild(b);
            }
            if (focusedNode && !s.busy) [...s.list.children].find(b => b.dataset.graphNode === focusedNode)?.focus();
            s.detailTitle.textContent = selected.title;
            s.detailKind.textContent = selected.type === 'movie' ? '影片节点' : '人物节点';
            s.detailSource.href = selected.url; s.detailSource.textContent = '打开豆瓣原页面 ↗';
            s.detailRelations.replaceChildren();
            for (const e of s.edges.values()) if (e.source === selected.id || e.target === selected.id) {
                const other = s.nodes.get(e.source === selected.id ? e.target : e.source);
                const li = document.createElement('li'), a = document.createElement('a');
                a.href = e.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = e.relation + ' · ' + other.title;
                a.title = '关系来源：' + e.url; li.appendChild(a); s.detailRelations.appendChild(li);
            }
            s.expand.disabled = s.busy || s.expanded.has(selected.id) || s.nodes.size >= MAX_NODES;
            s.expand.textContent = s.busy ? '读取中…' : s.expanded.has(selected.id) ? '已展开' : '展开关系';
            s.status.textContent = s.message;
            s.note.textContent = s.nodes.size + ' 个节点 · ' + s.edges.size + ' 条关系。' + (s.limited ? '已到容量上限，最多80个节点。' : '最多80个节点，每部优先展示8位主演和8部豆瓣推荐。') + '“豆瓣推荐”不代表续作；“人物页作品”不推断具体职务。';
            applyView(s);
        }
        function close() {
            const s = active; if (!s) return; active = null;
            s.cancel?.(); document.removeEventListener('keydown', s.onKey); window.removeEventListener('resize', s.onResize); document.body.style.overflow = s.previousOverflow;
            s.modal.remove(); if (s.origin.isConnected) s.origin.focus();
        }
        function open(context, origin) {
            closeMoreMenu(); close();
            const root = normalizeUrl('https://movie.douban.com/subject/' + context.doubanId + '/');
            if (!root) return;
            const modal = document.createElement('div'); modal.className = 'zcw-graph'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', '电影关系图谱');
            modal.innerHTML = '<header class="zcw-graph-header"><div><strong>电影关系图谱</strong><small>从一部电影，探索它与人和作品的联系</small></div><button type="button" class="zcw-graph-close" aria-label="关闭关系图谱">关闭 ×</button></header><div class="zcw-graph-body"><section class="zcw-graph-canvas"><div class="zcw-graph-tools"><span>● 影片　<span class="zcw-graph-person-legend">● 人物</span></span><button type="button" data-graph-tool="in" aria-label="放大">＋</button><button type="button" data-graph-tool="out" aria-label="缩小">−</button><button type="button" data-graph-tool="fit">适应画布</button></div><svg class="zcw-graph-svg" viewBox="0 0 1000 700" aria-label="电影关系网络"></svg><p class="zcw-graph-help">拖动画布 · 滚轮缩放 · 点击节点查看 · 双击节点展开</p></section><aside class="zcw-graph-side"><div class="zcw-graph-detail"><small class="zcw-graph-kind"></small><h2></h2><button type="button" class="zcw-graph-expand">展开关系</button><a class="zcw-graph-source" target="_blank" rel="noopener noreferrer"></a><ul class="zcw-graph-relations"></ul></div><details open><summary>节点列表 · 可用键盘选择</summary><div class="zcw-graph-list"></div></details></aside></div><footer><div class="zcw-graph-status" role="status" aria-live="polite"></div><div class="zcw-graph-note"></div></footer>';
            const svg = modal.querySelector('svg'), world = svgElement('g', {}), edgeLayer = svgElement('g', {}), nodeLayer = svgElement('g', {}); world.append(edgeLayer, nodeLayer); svg.appendChild(world);
            const s = { modal, svg, world, edgeLayer, nodeLayer, nodeViews: new Map(), origin, root: root.id, selected: root.id, nodes: new Map([[root.id, { ...root, title: context.title }]]), edges: new Map(), expanded: new Set(), busy: false, message: '', view: { x: 500, y: 350, scale: 1 }, previousOverflow: document.body.style.overflow,
                list: modal.querySelector('.zcw-graph-list'), detailTitle: modal.querySelector('h2'), detailKind: modal.querySelector('.zcw-graph-kind'), detailSource: modal.querySelector('.zcw-graph-source'), detailRelations: modal.querySelector('.zcw-graph-relations'), expand: modal.querySelector('.zcw-graph-expand'), status: modal.querySelector('.zcw-graph-status'), note: modal.querySelector('.zcw-graph-note') };
            active = s; document.body.appendChild(modal); document.body.style.overflow = 'hidden';
            modal.querySelector('.zcw-graph-close').addEventListener('click', close);
            s.expand.addEventListener('click', () => expand(s));
            modal.querySelectorAll('[data-graph-tool]').forEach(b => b.addEventListener('click', () => {
                if (b.dataset.graphTool === 'fit') fit(s);
                else { s.view.scale = Math.max(.12, Math.min(2.5, s.view.scale * (b.dataset.graphTool === 'in' ? 1.25 : .8))); applyView(s); }
            }));
            svg.addEventListener('wheel', e => { e.preventDefault(); s.view.scale = Math.max(.12, Math.min(2.5, s.view.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1))); applyView(s); }, { passive: false });
            let drag;
            svg.addEventListener('pointerdown', e => { if (e.button !== 0 || e.target.closest('.zcw-graph-node')) return; drag = { x: e.clientX, y: e.clientY, vx: s.view.x, vy: s.view.y }; svg.setPointerCapture(e.pointerId); });
            svg.addEventListener('pointermove', e => { if (!drag) return; s.view.x = drag.vx + e.clientX - drag.x; s.view.y = drag.vy + e.clientY - drag.y; applyView(s); });
            svg.addEventListener('pointerup', () => { drag = null; }); svg.addEventListener('pointercancel', () => { drag = null; });
            s.onKey = e => {
                if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); close(); }
                if (e.key === 'Tab') {
                    const controls = [...modal.querySelectorAll('button:not(:disabled),a[href],summary')].filter(n => !n.closest('details:not([open])') || n.tagName === 'SUMMARY');
                    if (e.shiftKey && document.activeElement === controls[0]) { e.preventDefault(); controls.at(-1)?.focus(); }
                    else if (!e.shiftKey && document.activeElement === controls.at(-1)) { e.preventDefault(); controls[0]?.focus(); }
                }
            };
            s.onResize = () => { if (active === s) { render(s); fit(s, true); } };
            window.addEventListener('resize', s.onResize);
            document.addEventListener('keydown', s.onKey); render(s); fit(s, true); modal.querySelector('.zcw-graph-close').focus();
            expand(s);
        }
        return { open, close, normalizeUrl, parseMovie, parsePerson, snapshot: () => active ? { nodes: [...active.nodes.values()].map(n => ({ ...n })), edges: [...active.edges.values()].map(e => ({ ...e })) } : null };
    })();

    const SITE_SETTINGS_KEY = 'zcw.searchSites.v1';
    let customSites = null, siteLoadError = '';
    function validateSite(site) {
        if (!site || typeof site.name !== 'string' || typeof site.template !== 'string') throw Error('请填写站点名称和搜索网址');
        const name = site.name.trim(), template = site.template.trim();
        if (!name || name.length > 24) throw Error('站点名称需为1至24字');
        if (template.length > 2000 || !template.includes('{q}') || /[\r\n\t]/.test(template)) throw Error('搜索网址需包含 {q}，用于代入片名');
        const url = new URL(template.replaceAll('{q}', 'zcwtitle'));
        if (!/^https?:$/.test(url.protocol) || url.username || url.password || !/^https?:\/\/[^/?#]+[/?]/i.test(template)) throw Error('请使用不含账号密码的 HTTP(S) 搜索网址');
        const authority = /^https?:\/\/([^/?#]+)/i.exec(template)?.[1];
        if (!authority || authority.includes('{q}')) throw Error('{q} 应放在网址路径或查询参数里，不能放在域名里');
        if (url.hash.includes('zcwtitle')) throw Error('{q} 应放在网址路径或查询参数里');
        return { name, template, enabled: site.enabled !== false };
    }
    function readSites() {
        if (customSites !== null) return customSites;
        customSites = [];
        try {
            const saved = typeof GM_getValue === 'function' ? GM_getValue(SITE_SETTINGS_KEY, []) : [];
            if (!Array.isArray(saved) || saved.length > 20) throw Error('设置格式无效');
            customSites = saved.map(validateSite);
        } catch (_) { siteLoadError = '站点设置读取失败或格式无效；可在设置中重新保存'; }
        return customSites;
    }
    function siteUrl(site, title) { return site.template.replaceAll('{q}', encodeURIComponent(title)); }
    function externalIds(entry) {
        const root = entry.mountMode === 'after' ? document.querySelector('#info') : entry.markNode;
        const ids = {};
        if (!root) return ids;
        const clean = root.cloneNode(true);
        clean.querySelectorAll('.comment,.comments,.comment-item,.ft,blockquote,.aside,.zcw-group').forEach(n => n.remove());
        for (const a of clean.querySelectorAll('a[href]')) {
            try {
                const u = new URL(a.getAttribute('href'), location.href);
                if (!/^https?:$/.test(u.protocol) || u.username || u.password) continue;
                if (/^(?:www\.)?imdb\.com$/.test(u.hostname)) ids.imdb ||= /^\/title\/(tt\d{7,10})(?:\/|$)/.exec(u.pathname)?.[1];
                if (/^(?:www\.)?themoviedb\.org$/.test(u.hostname)) {
                    const match = /^\/(movie|tv)\/(\d+)(?:-|\/|$)/.exec(u.pathname);
                    if (match) ids.tmdb ||= match[1] + '/' + match[2];
                }
            } catch (_) { /* 忽略非标准出站链接 */ }
        }
        if (entry.mountMode === 'after') ids.imdb ||= /IMDb\s*[:：]?\s*(tt\d{7,10})\b/i.exec(clean.textContent)?.[1];
        return ids;
    }
    let siteSettings = null;
    function openSiteSettings(origin) {
        closeMoreMenu();
        if (siteSettings) return;
        const draft = readSites().map(s => ({ ...s }));
        const backdrop = document.createElement('div'); backdrop.className = 'zcw-settings-backdrop';
        const form = document.createElement('form'); form.className = 'zcw-site-settings';
        form.setAttribute('role', 'dialog'); form.setAttribute('aria-modal', 'true'); form.setAttribute('aria-label', '自定义搜索站点');
        form.innerHTML = '<h3>自定义搜索站点</h3><p>站点显示在“更多”里，使用当前片名搜索。网址中的 {q} 代表片名，最多20个站点。</p><div class="zcw-site-list"></div><label>站点名称<input name="siteName" maxlength="24" placeholder="例如：我的搜索站"></label><label>搜索网址<input name="siteTemplate" type="text" maxlength="2000" placeholder="https://example.com/search?q={q}"></label><button type="button" class="zcw-site-add">添加站点</button><p class="zcw-site-notice"></p><div role="alert"></div><div class="zcw-site-footer"><button type="submit" class="zcw-site-save">保存</button><button type="button" class="zcw-site-cancel">取消</button></div>';
        const list = form.querySelector('.zcw-site-list'), error = form.querySelector('[role=alert]');
        form.querySelector('.zcw-site-notice').textContent = siteLoadError || '只保存站点设置，不保存影片和搜索历史。';
        const close = () => {
            document.removeEventListener('keydown', onKey); backdrop.remove(); siteSettings = null;
            if (origin.isConnected) origin.focus();
        };
        const render = () => {
            list.replaceChildren();
            draft.forEach((site, index) => {
                const row = document.createElement('div'); row.className = 'zcw-site-row';
                const label = document.createElement('label'), checkbox = document.createElement('input');
                checkbox.type = 'checkbox'; checkbox.checked = site.enabled;
                checkbox.addEventListener('change', () => { site.enabled = checkbox.checked; });
                label.append(checkbox, document.createTextNode(site.name)); label.title = site.template; row.appendChild(label);
                for (const [action, text] of [['up', '上移'], ['down', '下移'], ['delete', '删除']]) {
                    const b = document.createElement('button'); b.type = 'button'; b.dataset.siteAction = action; b.textContent = text;
                    b.setAttribute('aria-label', text + ' ' + site.name);
                    b.disabled = action === 'up' && index === 0 || action === 'down' && index === draft.length - 1;
                    b.addEventListener('click', () => {
                        if (action === 'delete') draft.splice(index, 1);
                        else { const next = index + (action === 'up' ? -1 : 1); [draft[index], draft[next]] = [draft[next], draft[index]]; }
                        render(); (list.querySelectorAll('.zcw-site-row')[Math.min(index, draft.length - 1)]?.querySelector('input') || form.querySelector('[name=siteName]')).focus();
                    }); row.appendChild(b);
                }
                list.appendChild(row);
            });
        };
        form.querySelector('.zcw-site-add').addEventListener('click', () => {
            try {
                if (draft.length >= 20) throw Error('最多添加20个站点');
                const site = validateSite({ name: form.elements.siteName.value, template: form.elements.siteTemplate.value });
                if (draft.some(s => s.name === site.name)) throw Error('站点名称已存在');
                draft.push(site); render(); error.textContent = ''; form.elements.siteName.value = ''; form.elements.siteTemplate.value = ''; form.elements.siteName.focus();
            } catch (e) { error.textContent = e instanceof TypeError ? '搜索网址格式无效，请填写完整 HTTP(S) 网址并包含 {q}' : e.message; }
        });
        form.addEventListener('submit', e => {
            e.preventDefault();
            if (form.elements.siteName.value.trim() || form.elements.siteTemplate.value.trim()) { error.textContent = '填写的站点尚未添加，请先点击“添加站点”或清空输入'; return; }
            try {
                if (typeof GM_setValue !== 'function') throw Error('missing API');
                GM_setValue(SITE_SETTINGS_KEY, draft.map(validateSite)); customSites = draft.map(s => ({ ...s })); siteLoadError = ''; close();
            } catch (_) { error.textContent = '保存失败，请确认油猴已授予设置存储权限后重试'; }
        });
        form.querySelector('.zcw-site-cancel').addEventListener('click', close);
        backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
        const onKey = e => {
            if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); close(); }
            if (e.key === 'Tab') {
                const controls = [...form.querySelectorAll('input,button')].filter(n => !n.disabled);
                if (e.shiftKey && document.activeElement === controls[0]) { e.preventDefault(); controls.at(-1).focus(); }
                else if (!e.shiftKey && document.activeElement === controls.at(-1)) { e.preventDefault(); controls[0].focus(); }
            }
        };
        render(); backdrop.appendChild(form); document.body.appendChild(backdrop); siteSettings = backdrop;
        document.addEventListener('keydown', onKey); form.elements.siteName.focus();
    }

    const SEASON_SUFFIX = /\s*(?:第[零〇一二三四五六七八九十百\d]+季|Season\s+\d+)\s*$/i;
    function movieYear(entry) {
        const node = entry.markNode;
        const headingYear = node.querySelector('.year')?.textContent || '';
        const details = node.querySelector('.abstract')?.textContent || '';
        const intro = node.querySelector('.intro')?.textContent || '';
        return headingYear.match(/\b(?:18|19|20)\d{2}\b/)?.[0] ||
            details.match(/年份\s*[:：]\s*((?:18|19|20)\d{2})\b/)?.[1] ||
            intro.match(/^\s*((?:18|19|20)\d{2})(?=[-(（\s/]|$)/)?.[1] || '';
    }

    async function copyTitle(title) {
        try { await navigator.clipboard.writeText(title); return true; } catch (_) { /* 兼容未授权或旧浏览器 */ }
        const input = document.createElement('textarea');
        input.value = title; input.readOnly = true;
        input.style.cssText = 'position:fixed;left:-10000px;top:0';
        const previous = document.activeElement;
        document.body.appendChild(input); input.select();
        try { return document.execCommand('copy'); } catch (_) { return false; }
        finally { input.remove(); if (previous?.isConnected) previous.focus(); }
    }

    function updateSearchLinks(context) {
        let title = context.includeSeason ? context.title : context.mainTitle;
        if (context.includeYear && !new RegExp('\\b' + context.year + '\\b').test(title)) title += ' ' + context.year;
        context.current = title;
        [...context.links, ...(context.extraLinks || [])].forEach(({ link, buildUrl }) => {
            link.href = buildUrl(title, { literal: true });
            link.setAttribute('data-zcw-title', title); link.title = link.textContent + '：' + title;
        });
    }

    let moreMenu = null;
    function closeMoreMenu(focus = false) {
        if (!moreMenu) return;
        const { element, origin, outside, reposition } = moreMenu;
        document.removeEventListener('click', outside);
        window.removeEventListener('resize', reposition);
        window.removeEventListener('scroll', reposition, true);
        element.remove(); origin.setAttribute('aria-expanded', 'false'); moreMenu = null;
        if (focus && origin.isConnected) origin.focus();
    }
    function openMoreMenu(context, origin) {
        if (moreMenu?.origin === origin) { closeMoreMenu(true); return; }
        closeMoreMenu();
        const element = document.createElement('div'); element.className = 'zcw-more-menu';
        element.setAttribute('role', 'dialog'); element.setAttribute('aria-label', '影片操作');
        const status = document.createElement('div'); status.className = 'zcw-more-status'; status.setAttribute('role', 'status');
        const add = (action, text, handler, disabled = false, pressed) => {
            const button = document.createElement('button'); button.type = 'button';
            button.dataset.zcwAction = action; button.textContent = text; button.disabled = disabled;
            if (pressed !== undefined) button.setAttribute('aria-pressed', String(pressed));
            button.addEventListener('click', async e => {
                e.preventDefault(); e.stopPropagation();
                try { await handler(button); } catch (_) { status.textContent = '操作失败，请重试'; }
            });
            element.appendChild(button); return button;
        };
        add('copy', '复制片名', async button => {
            button.disabled = true;
            const ok = await copyTitle(context.title);
            status.textContent = ok ? '已复制片名' : '复制失败，请重试或手动复制片名'; button.disabled = false;
        });
        add('all', '三站一起搜', () => { context.links.forEach(({ link }) => openSearchUrl(link.href)); closeMoreMenu(true); });
        add('year', '搜索时加年份' + (context.year ? '（' + context.year + '）' : '（未提供）'), button => {
            context.includeYear = !context.includeYear; updateSearchLinks(context);
            button.setAttribute('aria-pressed', String(context.includeYear));
        }, !context.year, context.includeYear);
        add('season', '搜索时保留季数', button => {
            context.includeSeason = !context.includeSeason; updateSearchLinks(context);
            button.setAttribute('aria-pressed', String(context.includeSeason));
        }, context.mainTitle === context.title, context.includeSeason);
        for (const [action, label, suffix] of [['trailer', 'B站搜预告', '预告片'], ['explain', 'B站搜解说', '解说']]) {
            add(action, label, () => { openSearchUrl(buildBilibiliSearchUrl(context.current + ' ' + suffix, { literal: true })); closeMoreMenu(true); });
        }
        context.extraLinks = [];
        const extra = (className, label, buildUrl) => {
            const link = searchLink(context.current, className, label, () => buildUrl(context.current));
            context.extraLinks.push({ link, buildUrl }); element.appendChild(link);
        };
        extra('zcw-imdb-link', context.ids.imdb ? 'IMDb · 查看条目' : 'IMDb · 搜索片名', title => context.ids.imdb ? 'https://www.imdb.com/title/' + context.ids.imdb + '/' : 'https://www.imdb.com/find/?q=' + encodeURIComponent(title) + '&s=tt');
        extra('zcw-tmdb-link', context.ids.tmdb ? 'TMDB · 查看条目' : 'TMDB · 搜索片名', title => context.ids.tmdb ? 'https://www.themoviedb.org/' + context.ids.tmdb : 'https://www.themoviedb.org/search?query=' + encodeURIComponent(title));
        for (const site of readSites().filter(s => s.enabled)) extra('zcw-custom-link', site.name, title => siteUrl(site, title));
        add('graph', '电影关系图谱…', () => MovieGraph.open(context, origin), !context.doubanId);
        add('settings', '自定义搜索站点…', () => openSiteSettings(origin));
        if (siteLoadError) status.textContent = siteLoadError;
        element.appendChild(status); document.body.appendChild(element);
        origin.setAttribute('aria-expanded', 'true');
        const reposition = () => {
            if (!origin.isConnected || origin.closest('[hidden]')) { closeMoreMenu(); return; }
            const rect = origin.getBoundingClientRect();
            element.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - element.offsetWidth - 8)) + 'px';
            element.style.top = Math.max(8, Math.min(rect.bottom + 5, window.innerHeight - element.offsetHeight - 8)) + 'px';
        };
        const outside = e => { if (!element.contains(e.target) && !origin.contains(e.target)) closeMoreMenu(); };
        moreMenu = { element, origin, outside, reposition }; reposition();
        document.addEventListener('click', outside);
        window.addEventListener('resize', reposition); window.addEventListener('scroll', reposition, true);
        element.addEventListener('keydown', e => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMoreMenu(true); }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const buttons = [...element.querySelectorAll('button:not(:disabled),a[href]')];
                const index = buttons.indexOf(document.activeElement);
                buttons[(index + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
            }
        });
        element.querySelector('button').focus();
    }

    function createButton(title, doubanId, year = '', ids = {}) {
        const resolved = resolveSearchTitle(title);
        if (!buildSearchUrl(resolved)) return null;
        const group = document.createElement('span'); group.className = 'zcw-group';
        const mainTitle = resolved.replace(SEASON_SUFFIX, '').trim() || resolved;
        const context = { title: resolved, mainTitle, current: resolved, year, ids, doubanId, includeYear: false, includeSeason: true, links: [] };
        for (const [className, text, buildUrl] of [[BTN_CLASS, CONFIG.BUTTON_TEXT, buildSearchUrl], [BILIBILI_BTN_CLASS, CONFIG.BILIBILI_BUTTON_TEXT, buildBilibiliSearchUrl], [SOQUARK_BTN_CLASS, CONFIG.SOQUARK_BUTTON_TEXT, buildSoquarkSearchUrl]]) {
            const link = searchLink(resolved, className, text, buildUrl);
            if (doubanId) link.setAttribute('data-zcw-id', doubanId);
            context.links.push({ link, buildUrl }); group.appendChild(link);
        }
        const more = document.createElement('button'); more.type = 'button'; more.className = 'zcw-more-toggle'; more.textContent = '更多 ▾';
        more.setAttribute('aria-haspopup', 'dialog'); more.setAttribute('aria-expanded', 'false');
        more.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openMoreMenu(context, more); });
        group.appendChild(more); return group;
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
        const group = createButton(entry.title, entry.doubanId, movieYear(entry), externalIds(entry));
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
        CONFIG, MovieGraph, DoulistSort, preferredSearchTitle, extractTitle, resolveSearchTitle,
        sanitizeSearchTitle, MAX_SEARCH_TITLE_CHARS, buildSearchUrl, buildBilibiliKeyword,
        buildBilibiliSearchUrl, buildSoquarkSearchUrl, BILIBILI_SEARCH_URL, SOQUARK_SEARCH_URL,
        ExternalSearchAction, createButton, createBilibiliButton, createSoquarkButton,
        BILIBILI_BTN_CLASS, SOQUARK_BTN_CLASS, detectPage, detectDoubanPage,
        process, getRoot, collectAnchors, pickTitleAnchor, extractDoubanMovie,
    };
})();
