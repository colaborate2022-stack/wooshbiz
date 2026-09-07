#!/usr/bin/env node
/* ==========================================================================
   gen-faq-schema — write a page's FAQPage block from its visible FAQ
   --------------------------------------------------------------------------
   tools/check-schema.js enforces that a page carrying .faq-item markup also
   carries FAQPage schema saying exactly the same words. It deliberately has
   no --fix, because when five copies of the business entity disagree only a
   human knows which is right.

   FAQ schema is the one case where that reasoning does not apply. It is not
   an independent claim that can be right or wrong on its own — it is a pure
   restatement of the visible answers, so there is only ever one correct
   value and a machine can derive it. Hand-typing it is how it drifts.

   So: check-schema stays the judge, this is the typist. Text extraction here
   is deliberately identical to check-schema's (decode entities, strip tags,
   collapse whitespace), because two different normalisers would disagree at
   the first &mdash; and the checker would report drift that isn't there.

   Usage
       node tools/gen-faq-schema.js <page.html> [...]   rewrite in place
       node tools/gen-faq-schema.js --check <page.html> exit 1 if out of date

   Inserts the block just before </head> if the page has no FAQPage yet, and
   replaces it in place if it does. Other JSON-LD blocks are left alone.

   No dependencies. Node stdlib only.
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const targets = args.filter(a => !a.startsWith('--'));

if (!targets.length) {
    console.error('Usage: node tools/gen-faq-schema.js [--check] <page.html> [...]');
    process.exit(2);
}

/* The one definition of "what does this FAQ actually say", shared with
   check-schema.js. Importing rather than copying is the whole point: this
   tool writes what that one judges, so a second normaliser here would
   eventually emit text the checker rejects for reasons neither file shows. */
const { faqItems } = require('./lib/faq-text');

/** The FAQPage node a page's visible markup implies. */
function buildBlock(html) {
    const items = faqItems(html).map(it => ({
        '@type': 'Question',
        name: it.question,
        acceptedAnswer: { '@type': 'Answer', text: it.answer }
    }));
    if (!items.length) return null;
    return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: items
    };
}

/* A page's JSON-LD blocks, with the source offsets needed to replace one. */
function ldBlocks(html) {
    const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
    const out = [];
    let m;
    while ((m = re.exec(html)) !== null) {
        let parsed = null;
        try { parsed = JSON.parse(m[1]); } catch (_) { /* leave malformed alone */ }
        out.push({ start: m.index, end: m.index + m[0].length, parsed });
    }
    return out;
}

let failed = 0;

for (const rel of targets) {
    const full = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
    if (!fs.existsSync(full)) {
        console.error(`${rel}: no such file`);
        failed++;
        continue;
    }

    /* Worth knowing before you debug anything in here: the generated FAQPage
       lives in <head>, so in file order the schema comes BEFORE the visible
       .faq-item markup it was derived from. Every answer therefore appears
       twice, schema copy first. A first-occurrence search-and-replace on an
       answer edits the schema and leaves the visible text alone — which looks
       like this tool corrupting a page, when it is actually doing its job and
       restoring the schema from the markup that is the source of truth.
       The visible markup always wins; the schema is downstream of it. */
    const before = fs.readFileSync(full, 'utf8');
    const block = buildBlock(before);

    if (!block) {
        console.log(`${rel}: no .faq-item markup — nothing to generate.`);
        continue;
    }

    // Match the file's own indentation for the block, so the diff stays readable.
    const json = JSON.stringify(block, null, 2)
        .split('\n').map(l => '    ' + l).join('\n');
    const script = `    <script type="application/ld+json">\n${json}\n    </script>`;

    const existing = ldBlocks(before).find(
        b => b.parsed && b.parsed['@type'] === 'FAQPage'
    );

    /* Compare MEANING, not bytes. The hand-written blocks on high-octane.html
       and outdoors.html say exactly the right thing in slightly different
       whitespace, and a byte comparison called them stale and offered to
       rewrite them — churn on correct pages, and a --check that disagrees
       with check-schema about pages check-schema passes. If the schema
       already says the right words, this tool has nothing to do. */
    if (existing && JSON.stringify(existing.parsed) === JSON.stringify(block)) {
        console.log(`${rel}: FAQPage already matches its ${block.mainEntity.length} visible answers.`);
        continue;
    }

    let after;
    if (existing) {
        after = before.slice(0, existing.start) + script.trimStart() + before.slice(existing.end);
    } else {
        const head = before.indexOf('</head>');
        if (head === -1) {
            console.error(`${rel}: no </head> to insert before`);
            failed++;
            continue;
        }
        after = before.slice(0, head) + script + '\n' + before.slice(head);
    }

    if (after === before) {
        console.log(`${rel}: FAQPage already matches its ${block.mainEntity.length} visible answers.`);
        continue;
    }

    if (CHECK) {
        console.error(`${rel}: FAQPage is out of date — run: node tools/gen-faq-schema.js ${rel}`);
        failed++;
        continue;
    }

    fs.writeFileSync(full, after);
    console.log(`${rel}: wrote FAQPage from ${block.mainEntity.length} visible answers.`);
}

process.exit(failed ? 1 : 0);
