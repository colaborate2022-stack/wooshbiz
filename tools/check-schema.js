#!/usr/bin/env node
/* ==========================================================================
   check-schema — hold the site's JSON-LD to the shape it was built in
   --------------------------------------------------------------------------
   Two pieces of structured data on this site are maintained by hand and both
   rot silently, because nothing on a page looks wrong when they do. This is
   the check that notices.

   1. The business entity, in five copies.

      There used to be three separate, unlinked descriptions of the company
      (index, about, contact) with different names and different details, which
      reads to a crawler as three companies. The fix was NOT to collapse them
      to one and have the others point at it: Google does not reliably follow
      an @id across page boundaries, so a bare {"@id": "…"} leaves that page
      describing something unresolvable, and strips the provider name off the
      Service blocks that need one.

      So every page carries a self-contained node and they all share one @id:

          https://wooshbiz.com/#organization

      index.html holds the full version — the rating, the contact point,
      knowsAbout. The others repeat only what identifies the entity. That
      buys correctness and costs duplication, which is what this checks: the
      shared fields have to agree across all five, and nothing may be a bare
      reference.

   2. The FAQPage blocks on high-octane.html and outdoors.html.

      Those are hand-maintained, unlike the FAQPage that build-post.js emits
      for listicles. Google grants FAQ rich results only while the schema and
      the visible answers say the same thing, so an edit to one and not the
      other quietly forfeits them. This re-derives the schema from the
      .faq-item markup and diffs it.

   Usage
       node tools/check-schema.js           report, exit 1 on any problem
       node tools/check-schema.js --check   same (alias, for muscle memory)

   There is deliberately no --fix. When five copies disagree, only a human
   knows which one is right.

   No dependencies. Node stdlib only.
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CANONICAL_ID = 'https://wooshbiz.com/#organization';

/* Fields that must be identical everywhere the canonical @id appears. Kept
   deliberately short: these identify the entity, and duplicating more than
   identity across five files would be asking for the drift this prevents. */
const SHARED_FIELDS = ['name', 'url', 'logo'];

/* Fields that are the homepage's job alone. If one of these turns up on a
   subpage there are two answers to the same question in the index. */
const HOME_ONLY_FIELDS = ['aggregateRating', 'contactPoint', 'knowsAbout'];

const CANONICAL_HOME = 'index.html';

/* The pages that MUST carry a copy of the entity. Named explicitly rather than
   inferred from whatever the scan happens to find: "the copies I found agree"
   is a green result even when a page has quietly dropped out of scope, which is
   the failure this file is most likely to have itself. */
const REQUIRED_ENTITY_PAGES = [
    'index.html',
    'about.html',
    'contact.html',
    'high-octane.html',
    'outdoors.html'
];

/* These two carry hand-maintained FAQPage blocks today. If one stops being
   scanned, or loses its schema, that is a finding and not a skip.

   It is a FLOOR, not the list. The pages actually checked are these plus any
   page found carrying .faq-question markup, because a hardcoded list answers
   "did the pages I was told about keep their schema" when the question is
   "does every page with visible FAQs have schema". Add an FAQ to a new page
   and this notices on its own rather than staying quietly green. */
const FAQ_PAGES_FLOOR = ['high-octane.html', 'outdoors.html'];

const problems = [];
const note = (file, msg) => problems.push(`${file}: ${msg}`);

/* -------------------------------------------------------------------------
   Collect pages: every served .html, at any depth.

   This walks rather than looking one folder down, because one folder down was
   a lie that reported success. The legacy redirect stubs live two deep
   (post/<slug>/index.html, timeline-blogs/<slug>/…) and were silently outside
   the tool's reach — they carry no JSON-LD today, so nothing was wrong, but
   "OK" meant "OK for the pages I happened to look at" and would have gone on
   saying so if one of them grew a broken block.

   Backups are skipped: they are frozen snapshots and are never served.
   ------------------------------------------------------------------------- */

const SKIP_DIRS = new Set(['tools', 'assets', 'images', 'videos', 'node_modules']);

function pages(dir = ROOT, rel = '', out = []) {
    for (const f of fs.readdirSync(dir)) {
        if (f.startsWith('.')) continue;
        const full = path.join(dir, f);
        const here = rel ? `${rel}/${f}` : f;

        let stat;
        try { stat = fs.statSync(full); } catch { continue; }

        if (stat.isDirectory()) {
            if (SKIP_DIRS.has(f)) continue;
            pages(full, here, out);
        } else if (f.endsWith('.html') && !f.includes('.backup')) {
            out.push({ rel: here, full });
        }
    }
    return out;
}

/* Attributes are allowed either side of the type, and must be: the hand-written
   pages open the tag bare, while build-post.js emits
   `<script type="application/ld+json" id="ldJson">` so it can rewrite the block.
   A stricter pattern matched only the hand-written pages and skipped all 62
   generated ones without saying so — which is the exact failure this file is
   supposed to catch, so it is worth the looser regex. */
const LD_RE = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g;

/** Every node in a parsed JSON-LD tree, flattened. */
function nodes(value, acc = []) {
    if (!value || typeof value !== 'object') return acc;
    if (Array.isArray(value)) {
        value.forEach(v => nodes(v, acc));
        return acc;
    }
    acc.push(value);
    Object.values(value).forEach(v => nodes(v, acc));
    return acc;
}

/* -------------------------------------------------------------------------
   Pass 1 — parse every block, and gather the canonical-entity nodes
   ------------------------------------------------------------------------- */

const entityNodes = [];
let blockCount = 0;

/* Reported in the OK line on purpose. The one failure this tool cannot detect
   from the inside is its own scope shrinking — every check downstream passes
   happily when the scan finds nothing. Printing the count makes a drop from
   103 pages to 7 visible to whoever runs it. */
const scanned = pages();

for (const page of scanned) {
    const html = fs.readFileSync(page.full, 'utf8');

    for (const [i, match] of [...html.matchAll(LD_RE)].entries()) {
        blockCount++;
        let parsed;
        try {
            parsed = JSON.parse(match[1]);
        } catch (err) {
            note(page.rel, `JSON-LD block ${i} does not parse — ${err.message}`);
            continue;
        }

        for (const node of nodes(parsed)) {
            if (node['@id'] !== CANONICAL_ID) continue;

            // A node that is nothing but an @id is a cross-page reference,
            // which is the failure mode this whole shape exists to avoid.
            if (Object.keys(node).length === 1) {
                note(page.rel, `bare cross-page reference to ${CANONICAL_ID} — ` +
                               'the node must define itself on the page that uses it');
                continue;
            }
            entityNodes.push({ page: page.rel, node });
        }
    }
}

/* -------------------------------------------------------------------------
   Pass 2 — the five copies have to agree
   ------------------------------------------------------------------------- */

if (!entityNodes.length) {
    note('(site)', `no node anywhere carries the canonical @id ${CANONICAL_ID}`);
} else {
    for (const required of REQUIRED_ENTITY_PAGES) {
        if (!entityNodes.some(e => e.page === required)) {
            note(required, `expected a copy of the canonical entity here, found none`);
        }
    }

    for (const field of SHARED_FIELDS) {
        const seen = new Map();
        for (const { page, node } of entityNodes) {
            if (node[field] === undefined) {
                note(page, `canonical entity is missing "${field}"`);
                continue;
            }
            const key = JSON.stringify(node[field]);
            if (!seen.has(key)) seen.set(key, []);
            seen.get(key).push(page);
        }
        if (seen.size > 1) {
            const detail = [...seen.entries()]
                .map(([v, ps]) => `      ${v}  (${ps.join(', ')})`)
                .join('\n');
            note('(site)', `copies of the canonical entity disagree on "${field}":\n${detail}`);
        }
    }

    for (const { page, node } of entityNodes) {
        if (page === CANONICAL_HOME) continue;
        for (const field of HOME_ONLY_FIELDS) {
            if (node[field] !== undefined) {
                note(page, `"${field}" belongs only on ${CANONICAL_HOME} — ` +
                           'two copies of it is two answers to the same question');
            }
        }
    }
}

/* -------------------------------------------------------------------------
   Pass 3 — hand-maintained FAQPage blocks must match the visible FAQ
   ------------------------------------------------------------------------- */

const FAQ_ITEM_RE =
    /<div class="faq-question">([\s\S]*?)<\/div>\s*<div class="faq-answer">([\s\S]*?)<\/div>/g;

/* A hardcoded list of four named entities was the same trap in miniature: the
   day an answer gains an &eacute; or a &#8217;, the decode misses it, the text
   stops matching the schema and the tool reports drift that isn't there. A
   checker that cries wolf gets switched off, so decode generically — numeric
   first, then the named entities that actually occur in HTML prose. */
const NAMED_ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    mdash: '—', ndash: '–', hellip: '…',
    lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
    eacute: 'é', egrave: 'è', uuml: 'ü', ouml: 'ö', auml: 'ä',
    deg: '°', times: '×', middot: '·', bull: '•',
    rarr: '→', larr: '←', trade: '™', copy: '©', reg: '®'
};

function decodeEntities(s) {
    return s
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
        .replace(/&([a-z]+);/gi, (m, name) => {
            const hit = NAMED_ENTITIES[name.toLowerCase()];
            return hit === undefined ? m : hit;
        });
}

/** Visible answer text, as a crawler would read it. */
function visibleText(html) {
    return decodeEntities(html.replace(/<[^>]+>/g, ''))
        .replace(/\s+/g, ' ')
        .trim();
}

/* The floor, plus every page the scan found carrying visible FAQ markup. The
   generated posts emit their listicle FAQPage from build-post.js and use
   different markup, so they do not land in here and their drift stays that
   tool's job. */
const faqPages = [...new Set([
    ...FAQ_PAGES_FLOOR,
    ...scanned
        .filter(p => fs.readFileSync(p.full, 'utf8').includes('class="faq-question"'))
        .map(p => p.rel)
])].sort();

for (const file of faqPages) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) { note(file, 'expected this page to exist and carry a hand-maintained FAQ'); continue; }
    const html = fs.readFileSync(full, 'utf8');

    const visible = [...html.matchAll(FAQ_ITEM_RE)]
        .map(([, q, a]) => ({ q: visibleText(q), a: visibleText(a) }));

    let faqBlock = null;
    for (const match of html.matchAll(LD_RE)) {
        let parsed;
        try { parsed = JSON.parse(match[1]); } catch { continue; }
        if (parsed['@type'] === 'FAQPage') faqBlock = parsed;
    }

    if (!visible.length) {
        if (faqBlock) note(file, 'has FAQPage schema but no .faq-item markup to back it');
        continue;
    }
    if (!faqBlock) {
        note(file, `has ${visible.length} visible FAQs but no FAQPage schema`);
        continue;
    }

    const marked = (faqBlock.mainEntity || []).map(q => ({
        q: (q.name || '').trim(),
        a: ((q.acceptedAnswer || {}).text || '').trim()
    }));

    if (marked.length !== visible.length) {
        note(file, `FAQPage lists ${marked.length} questions, the page shows ${visible.length}`);
    }

    const n = Math.min(marked.length, visible.length);
    for (let i = 0; i < n; i++) {
        if (marked[i].q !== visible[i].q) {
            note(file, `FAQ ${i + 1} question differs from the schema:\n` +
                       `      page:   ${visible[i].q}\n` +
                       `      schema: ${marked[i].q}`);
        } else if (marked[i].a !== visible[i].a) {
            note(file, `FAQ ${i + 1} ("${visible[i].q}") answer differs from the schema`);
        }
    }
}

/* -------------------------------------------------------------------------
   Report
   ------------------------------------------------------------------------- */

if (problems.length) {
    console.error('Structured data problems:\n');
    problems.forEach(p => console.error('  ' + p));
    console.error(
        `\n${problems.length} problem(s) across ${blockCount} JSON-LD block(s) ` +
        `on ${scanned.length} page(s).\n` +
        'Nothing is auto-fixable here — when copies disagree, only you know which is right.'
    );
    process.exit(1);
}

console.log(
    `OK — ${scanned.length} page(s) scanned, ${blockCount} JSON-LD block(s) parse, ` +
    `${entityNodes.length} copies of the canonical entity agree, ` +
    `and ${faqPages.length} hand-maintained FAQPage block(s) match their visible FAQ.`
);
