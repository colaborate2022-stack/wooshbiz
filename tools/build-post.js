#!/usr/bin/env node
/* ==========================================================================
   build-post — pre-render a CMS post into a real, static, indexable page
   --------------------------------------------------------------------------
   blog-post.html is a client-side shell. It fetches the post from Supabase and
   writes the title, description, canonical, JSON-LD and the entire article body
   into the DOM after load. That works for humans and it is what every ?id= URL
   has served since the Wix migration, but it means the HTML a crawler receives
   on the first fetch contains:

       <title>Blog | Woosh Biz</title>     ...identical on all 46 posts
       <div class="article-body" id="artBody"></div>    ...empty

   Google does render JavaScript, but rendering is queued separately from
   crawling and can lag by days or weeks, and until it happens every article
   looks like the same empty shell. That is the duplicate-page report c44a0af
   was chasing; rewriting the head from JS made the *rendered* page distinct
   but left the *crawled* page byte-identical.

   This generator bakes a post into a standalone page at its slug:

       node tools/build-post.js 46          build post 46 into <slug>/index.html
       node tools/build-post.js --check     rebuild all and exit 1 on drift

   It is a compiler, not a linter — the opposite of sync-partials.js. The
   generated file is committed (GitHub Pages has no build step) and is
   regenerated from blog-post.html + the CMS row, so the template stays the
   single source of truth for layout: restyle blog-post.html, re-run this,
   and every static post picks the change up.

   The dynamic ?id= URL keeps working and is pointed here via redirect_url, so
   there is exactly one indexable URL per post.

   No dependencies. Node stdlib only.
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'blog-post.html');
const SITE = 'https://wooshbiz.com';

const SUPABASE_URL = 'https://ytthcgdsbfagvwcopoaj.supabase.co';
const REST = `${SUPABASE_URL}/rest/v1/wooshbiz_blogs`;

/* The anon key is a public, RLS-guarded client credential — it already ships
   inside blog.html and admin.html. Read it from there rather than keeping a
   second copy here that can drift out of sync when the key is rotated. */
function anonKey() {
    const html = fs.readFileSync(path.join(ROOT, 'blog.html'), 'utf8');
    const m = html.match(/const SUPABASE_ANON_KEY\s*=\s*"([^"]+)"/);
    if (!m) throw new Error('Could not find SUPABASE_ANON_KEY in blog.html');
    return m[1];
}

/* ---------- helpers mirrored from blog-post.html ----------
   Deliberate duplication: these must produce byte-identical output to the
   client-side versions, or a pre-rendered page and its ?id= twin would
   disagree on heading anchors and meta descriptions. */

function stripHtml(html) {
    return (html || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function metaDescription(html, len) {
    const text = stripHtml(html);
    if (text.length <= len) return text;
    const cut = text.slice(0, len);
    const sp = cut.lastIndexOf(' ');
    const kept = sp > len * 0.6 ? cut.slice(0, sp) : cut;
    return kept.replace(/[\s,;:.–—-]+$/, '') + '…';
}

/* Posts are written with a standalone summary sentence as the opening
   paragraph — that is the line the author wants Google to print. Truncating the
   whole body at 155 chars instead runs the summary into the paragraph after it
   and ends mid-sentence on an ellipsis, which reads as a broken page in a
   result. Use the opening paragraph whole when it is already description-sized,
   and only fall back to truncation when it is not. */
function description(html) {
    const first = (html || '').match(/<p[^>]*>([\s\S]*?)<\/p>/);
    if (first) {
        const text = stripHtml(first[1]);
        if (text.length >= 80 && text.length <= 165) return text;
    }
    return metaDescription(html, 155);
}

function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function initials(name) {
    const parts = (name || 'Woosh Biz').trim().split(/\s+/).filter(Boolean);
    return ((parts[0] || 'W')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : (parts[0] || 'B')[1] || 'B')).toUpperCase();
}

function slugify(text) {
    return (text || 'section').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function readTime(html) {
    const words = stripHtml(html).split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200)) + ' min read';
}

function formatDate(d) {
    if (!d) return '';
    const date = new Date(d);
    if (isNaN(date)) return '';
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function abs(url) {
    if (!url) return '';
    return /^https?:\/\//i.test(url) ? url : SITE + '/' + String(url).replace(/^\/+/, '');
}

/* ---------- body rewriting ---------- */

/* Heading ids have to exist in the served HTML, not be assigned by buildToc()
   after load, or a shared #anchor link lands at the top of the page for anyone
   whose browser follows the fragment before the script runs. Same id scheme as
   blog-post.html so the two versions stay interchangeable. */
function addHeadingIds(body) {
    let i = 0;
    return body.replace(/<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/g, (full, attrs, inner) => {
        i += 1;
        if (attrs && /\sid=/.test(attrs)) return full;
        const id = `${slugify(stripHtml(inner))}-${i}`;
        return `<h2${attrs || ''} id="${id}">${inner}</h2>`;
    });
}

function headings(body) {
    const out = [];
    let i = 0;
    const re = /<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/g;
    let m;
    while ((m = re.exec(body))) {
        i += 1;
        const attrs = m[1] || '';
        const idMatch = attrs.match(/\sid="([^"]+)"/);
        out.push({
            id: idMatch ? idMatch[1] : `${slugify(stripHtml(m[2]))}-${i}`,
            label: stripHtml(m[2]),
        });
    }
    return out;
}

/* An <h3> question followed by its <p> answer, anywhere after a heading that
   announces an FAQ, is a Question/Answer pair. Google will only consider a
   page for the FAQ rich result if the answer text is in the markup — which it
   never was while the body arrived from the CMS after load. Returns [] for the
   posts that have no FAQ, and those pages then carry no FAQPage node. */
function faqEntries(body) {
    const start = body.search(/<h[23][^>]*>[^<]*(Frequently Asked Questions|FAQs?)\b/i);
    if (start === -1) return [];
    const re = /<h3(?:\s[^>]*)?>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g;
    const out = [];
    let m;
    while ((m = re.exec(body.slice(start)))) {
        out.push({
            '@type': 'Question',
            name: stripHtml(m[1]),
            acceptedAnswer: { '@type': 'Answer', text: stripHtml(m[2]) },
        });
    }
    return out;
}

/* A listicle numbers its <h2>s ("1. Treasure Hunt or Amazing Race"). Declaring
   those as an ItemList is what lets a result carry the list of items rather
   than one snippet, and the per-item #anchor is what Google links them to. */
function listItems(body, canonical) {
    const out = [];
    for (const h of headings(body)) {
        const m = h.label.match(/^(\d+)\.\s*(.+)$/);
        if (!m) continue;
        out.push({
            '@type': 'ListItem',
            position: Number(m[1]),
            name: m[2].trim(),
            url: `${canonical}#${h.id}`,
        });
    }
    return out;
}

/* Body images come out of the CMS as bare <img src alt>. Without intrinsic
   dimensions the browser reserves no space, so every image that loads shoves
   the article down — the layout shift half of Core Web Vitals. The files are
   on disk here at build time, so read the real size out of the PNG/JPEG header
   and bake width/height in. */
function pngSize(buf) {
    if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function jpegSize(buf) {
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    let off = 2;
    while (off + 9 < buf.length) {
        if (buf[off] !== 0xff) { off += 1; continue; }
        const marker = buf[off + 1];
        const len = buf.readUInt16BE(off + 2);
        // SOF0..SOF15, skipping the four non-frame markers in that range.
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
            return { h: buf.readUInt16BE(off + 5), w: buf.readUInt16BE(off + 7) };
        }
        off += 2 + len;
    }
    return null;
}

function imageSize(relPath) {
    const file = path.join(ROOT, relPath.replace(/^\/+/, '').split('?')[0]);
    if (!fs.existsSync(file)) return null;
    const buf = fs.readFileSync(file);
    return pngSize(buf) || jpegSize(buf);
}

function enhanceBodyImages(body) {
    return body.replace(/<img\s([^>]*)>/g, (full, attrs) => {
        const src = (attrs.match(/src="([^"]*)"/) || [])[1];
        if (!src || /^https?:\/\//i.test(src)) return full;

        let next = attrs;
        if (!/\sloading=/.test(next)) next += ' loading="lazy"';
        if (!/\sdecoding=/.test(next)) next += ' decoding="async"';

        const size = imageSize(src);
        if (size && !/\swidth=/.test(next)) {
            next += ` width="${size.w}" height="${size.h}"`;
        }
        // Root-absolute: this page lives one directory deep.
        next = next.replace(/src="([^"]*)"/, (m2, u) =>
            /^https?:\/\/|^\//.test(u) ? m2 : `src="/${u}"`);
        return `<img ${next.trim()}>`;
    });
}

/* ---------- page assembly ---------- */

function buildPage(template, post, slug) {
    const title = post.title || 'Untitled';
    const category = post.category || 'General';
    const author = post.author || 'Team Woosh Biz';
    const bodyRaw = post.body || '';
    const summary = description(bodyRaw);
    const image = post.cover_image ? abs(post.cover_image) : `${SITE}/images/og-default.png`;
    const canonical = `${SITE}/${slug}/`;
    const cover = post.cover_image ? '/' + String(post.cover_image).replace(/^\/+/, '') : '';

    let body = enhanceBodyImages(addHeadingIds(bodyRaw));
    const heads = headings(body);

    let out = template;

    /* --- head --- */
    /* An explicit robots line rather than relying on the indexable default:
       max-image-preview:large is what lets a result carry the cover image at
       full width instead of a thumbnail, and max-snippet:-1 lifts the cap on
       the description Google may quote. Neither is on by default. */
    out = out.replace(
        '<title>Blog | Woosh Biz</title>',
        `<title>${escapeHtml(title)} | Woosh Biz</title>\n` +
        `    <link rel="canonical" href="${canonical}">\n` +
        '    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">'
    );
    const setContent = (id, value) => {
        const re = new RegExp(`(id="${id}"[^>]*content=")[^"]*(")`);
        const re2 = new RegExp(`(content=")[^"]*("[^>]*id="${id}")`);
        if (re.test(out)) out = out.replace(re, `$1${escapeHtml(value)}$2`);
        else out = out.replace(re2, `$1${escapeHtml(value)}$2`);
    };
    /* The template's head carries a comment explaining why it has no canonical
       and only placeholder metadata. Neither is true once the page is baked, and
       a stale comment is worse than none. */
    out = out.replace(
        /    <!--\n      Placeholders only\.[\s\S]*?robots=noindex instead\.\n    -->/,
        `    <!--
      Generated by tools/build-post.js from blog-post.html + wooshbiz_blogs.
      Do not hand-edit: edit the template or the CMS row and rebuild with
      \`node tools/build-post.js ${post.id}\`.

      Unlike the ?id= shell this file is pre-rendered, so the title, description,
      canonical, og:* and JSON-LD below are real and are served on the first
      fetch — a crawler never has to run JavaScript to see the article.
    -->`
    );

    setContent('metaDesc', summary);
    setContent('ogTitle', `${title} | Woosh Biz`);
    setContent('ogDesc', summary);
    setContent('ogImage', image);
    setContent('ogUrl', canonical);

    /* Article + BreadcrumbList. The breadcrumb is what turns the blue URL line
       in a result into "Woosh Biz > Blog > Team Building". */
    const ld = [
        {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: title,
            description: summary,
            image: image,
            datePublished: post.created_at || undefined,
            dateModified: post.updated_at || post.created_at || undefined,
            articleSection: category,
            wordCount: stripHtml(bodyRaw).split(/\s+/).filter(Boolean).length,
            inLanguage: 'en',
            author: { '@type': 'Person', name: author },
            publisher: {
                '@type': 'Organization',
                name: 'Woosh Biz',
                logo: { '@type': 'ImageObject', url: `${SITE}/images/wix/wix-2f36ed41.png` },
            },
            mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
        },
        {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
                { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE}/blog.html` },
                { '@type': 'ListItem', position: 3, name: title, item: canonical },
            ],
        },
    ];

    /* Only for the posts that earn them: a numbered listicle gets an ItemList,
       an article with an FAQ section gets a FAQPage. Emitting either one empty
       is a structured-data error in Search Console, so both are conditional. */
    const items = listItems(body, canonical);
    if (items.length) {
        ld.push({
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: title,
            itemListOrder: 'https://schema.org/ItemListOrderAscending',
            numberOfItems: items.length,
            itemListElement: items,
        });
    }

    const faq = faqEntries(body);
    if (faq.length) {
        ld.push({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faq,
        });
    }

    out = out.replace(
        /<script type="application\/ld\+json" id="ldJson">[\s\S]*?<\/script>/,
        `<script type="application/ld+json" id="ldJson">${JSON.stringify(ld, null, 2)}</script>`
    );

    /* --- article --- */
    out = out.replace(
        /\s*<!-- Loading \/ error state[\s\S]*?<div class="article-status" id="pageStatus">Loading…<\/div>/,
        ''
    );
    out = out.replace('<article id="post" hidden>', '<article id="post">');
    out = out.replace(
        '<header class="article-hero" id="articleHero">',
        cover
            ? `<header class="article-hero" id="articleHero" style="--hero-img: url(&quot;${cover}&quot;)">`
            : '<header class="article-hero" id="articleHero">'
    );
    out = out.replace('<span class="current" id="crumbCat">Article</span>',
        `<span class="current" id="crumbCat">${escapeHtml(category)}</span>`);
    out = out.replace('<span class="article-tag" id="artTag">General</span>',
        `<span class="article-tag" id="artTag">${escapeHtml(category)}</span>`);
    out = out.replace('<h1 id="artTitle">Untitled</h1>',
        `<h1 id="artTitle">${escapeHtml(title)}</h1>`);

    const published = formatDate(post.created_at) || '—';
    out = out.replace(
        '<div class="article-meta" id="artMeta"></div>',
        `<div class="article-meta" id="artMeta">
                    <div class="meta-author">
                        <div class="avatar">${escapeHtml(initials(author))}</div>
                        <div class="meta-item">
                            <span class="meta-label">Words by</span>
                            <span class="meta-value">${escapeHtml(author)}</span>
                        </div>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Published</span>
                        <span class="meta-value"><time datetime="${escapeHtml((post.created_at || '').slice(0, 10))}">${escapeHtml(published)}</time></span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Reading time</span>
                        <span class="meta-value">${escapeHtml(readTime(bodyRaw))}</span>
                    </div>
                </div>`
    );

    const coverSize = post.cover_image ? imageSize(post.cover_image) : null;
    out = out.replace(
        '<img class="cover-image" id="artCover" alt="" hidden>',
        cover
            ? `<img class="cover-image" id="artCover" src="${cover}" alt="${escapeHtml(title)}"${coverSize ? ` width="${coverSize.w}" height="${coverSize.h}"` : ''} fetchpriority="high" decoding="async">`
            : '<img class="cover-image" id="artCover" alt="" hidden>'
    );

    out = out.replace(
        '<div class="article-body" id="artBody"></div>',
        `<div class="article-body" id="artBody">${body}</div>`
    );

    /* TOC, baked. blog-post.html hides it below two headings; match that. */
    const tocLinks = heads
        .map(h => `<a href="#${h.id}">${escapeHtml(h.label)}</a>`)
        .join('');
    if (heads.length >= 2) {
        out = out.replace('<div id="tocList"></div>', `<div id="tocList">${tocLinks}</div>`);
        out = out.replace('<div id="tocInlineList"></div>', `<div id="tocInlineList">${tocLinks}</div>`);
        out = out.replace('<nav class="toc-inline" id="tocInline" aria-label="In this article">',
            '<nav class="toc-inline has-items" id="tocInline" aria-label="In this article">');
    } else {
        out = out.replace('<aside class="toc-col" id="tocCol">', '<aside class="toc-col" id="tocCol" style="display:none">');
    }

    out = out.replace('<div class="avatar" id="authorAvatar">WB</div>',
        `<div class="avatar" id="authorAvatar">${escapeHtml(initials(author))}</div>`);
    out = out.replace('<div class="name" id="authorName">Team Woosh Biz</div>',
        `<div class="name" id="authorName">${escapeHtml(author)}</div>`);

    /* --- relative URLs ---
       The template is served from the site root; this page is one level deep.
       Rewrite the chrome's relative refs, and the two the recommendation
       renderer builds at runtime, to root-absolute. */
    out = out.replace(/(href|src)="((?:assets|images)\/[^"]*)"/g, '$1="/$2"');
    out = out.replace(/(href)="([a-z0-9-]+\.html)"/g, '$1="/$2"');
    out = out.replace('`blog-post.html?id=${encodeURIComponent(b.id)}`',
        '`/blog-post.html?id=${encodeURIComponent(b.id)}`');
    out = out.replace('src="${escapeHtml(b.cover_image)}"', 'src="/${escapeHtml(b.cover_image)}"');

    /* --- script ---
       The article is already in the DOM, so loadPost() must not run: it would
       refetch the row and overwrite identical markup for nothing, and on a
       failed fetch it would blank a page that was serving fine. Everything it
       does beyond rendering — share buttons, scroll-spy, motion, suggestions —
       still has to happen, so call those directly against the baked post. */
    out = out.replace(
        '        loadPost();',
        `        /* Pre-rendered by tools/build-post.js — the markup above is the
           source of truth. Wire up the interactive parts only. */
        (function initStaticPost() {
            const POST = ${JSON.stringify({ id: post.id, category, title })};
            renderShare(document.getElementById('shareRail'), POST.title);
            renderShare(document.getElementById('shareBar'), POST.title);
            trackToc(Array.from(document.querySelectorAll('#artBody > h2')));
            if (window.wooshMotion && window.wooshMotion.scan) {
                window.wooshMotion.scan(document.getElementById('post'));
            }
            loadRecommendations(POST);
        })();`
    );

    return out;
}

/* ---------- io ---------- */

async function fetchPost(id) {
    const key = anonKey();
    const url = `${REST}?id=eq.${encodeURIComponent(id)}&select=*`;
    const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`Supabase returned ${res.status}: ${await res.text()}`);
    const rows = await res.json();
    if (!rows.length) throw new Error(`No post with id=${id}`);
    return rows[0];
}

async function build(id, { check = false } = {}) {
    const post = await fetchPost(id);
    const slug = post.slug || slugify(post.title);
    if (!post.is_published) {
        throw new Error(`Post ${id} is not published — refusing to pre-render a draft.`);
    }

    const template = fs.readFileSync(TEMPLATE, 'utf8');
    const html = buildPage(template, post, slug);
    const outFile = path.join(ROOT, slug, 'index.html');

    if (check) {
        const current = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : null;
        const drifted = current !== html;
        console.log(`${drifted ? 'DRIFT' : 'ok   '}  ${slug}/index.html  (id=${id})`);
        return drifted ? 1 : 0;
    }

    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, html);
    console.log(`built  ${slug}/index.html  (id=${id}, ${html.length} bytes, ${headings(post.body || '').length} headings)`);
    return 0;
}

async function main() {
    const args = process.argv.slice(2);
    const check = args.includes('--check');
    const ids = args.filter(a => /^\d+$/.test(a));

    if (!ids.length) {
        console.error("usage: node tools/build-post.js <id> [<id>...] [--check]");
        process.exitCode = 2;
        return;
    }

    let bad = 0;
    for (const id of ids) bad += await build(id, { check });
    // Set the code rather than calling process.exit(): undici's keep-alive
    // socket from fetch() is still closing, and tearing the loop down under it
    // trips a libuv assertion on Windows. Letting the process end on its own
    // exits with this code once the handle drains.
    process.exitCode = bad ? 1 : 0;
}

main().catch(err => {
    console.error(err.message);
    process.exitCode = 2;
});
