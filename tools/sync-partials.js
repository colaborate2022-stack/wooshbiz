#!/usr/bin/env node
/* ==========================================================================
   sync-partials — keep the navbar and footer identical across every page
   --------------------------------------------------------------------------
   The site has no build step and no server-side includes, so the nav and
   footer were copy-pasted ten times and drifted: three different active
   states, "Free Consultation" vs "Free Consultation Call", two copyright
   years, one page still hotlinking the old Wix CDN for its social icons.

   This is a linter with a --fix, NOT a compiler. The .html files stay the
   committed source of truth and stay directly servable; this only rewrites
   the region between sentinel comments:

       <!-- @partial:nav active="in-office" -->
       ...generated, do not hand-edit...
       <!-- @end:nav -->

   Attributes on the opening sentinel:
       active="<key>"   which nav item gets class="active" aria-current="page"
       base="/"         prefix for every internal href (404.html needs this,
                        because it can be served from any path depth)

   Usage
       node tools/sync-partials.js           rewrite in place
       node tools/sync-partials.js --check   exit 1 if anything has drifted

   No dependencies. Node stdlib only.
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PARTIALS = path.join(__dirname, 'partials');
const CHECK = process.argv.includes('--check');

const templates = {
    nav: fs.readFileSync(path.join(PARTIALS, 'nav.html'), 'utf8').trimEnd(),
    footer: fs.readFileSync(path.join(PARTIALS, 'footer.html'), 'utf8').trimEnd()
};

/**
 * Fill a template for one page.
 *   {{base}}          -> the page's base prefix ('' or '/')
 *   {{active:key}}    -> the active attributes when key matches, else nothing
 */
function render(name, opts) {
    const active = ' class="active" aria-current="page"';
    return templates[name]
        .replace(/\{\{base\}\}/g, opts.base || '')
        .replace(/\{\{active:([a-z0-9-]+)\}\}/g, (_, key) => (key === opts.active ? active : ''));
}

/** Re-indent generated markup to sit under the sentinel's own indentation. */
function indent(block, pad) {
    if (!pad) return block;
    return block.split('\n').map(l => (l.trim() ? pad + l : l)).join('\n');
}

const files = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
let changed = [];
let touched = 0;

for (const file of files) {
    const full = path.join(ROOT, file);
    const before = fs.readFileSync(full, 'utf8');
    let after = before;
    let sawSentinel = false;

    for (const name of ['nav', 'footer']) {
        // [1] indent  [2] attributes on the opening sentinel  [3] current body
        const re = new RegExp(
            `([ \\t]*)<!--\\s*@partial:${name}([^>]*?)-->[\\s\\S]*?<!--\\s*@end:${name}\\s*-->`,
            'g'
        );

        after = after.replace(re, (match, pad, attrs) => {
            sawSentinel = true;
            const opts = {
                active: (attrs.match(/active="([^"]*)"/) || [])[1] || '',
                base: (attrs.match(/base="([^"]*)"/) || [])[1] || ''
            };
            return pad + `<!-- @partial:${name}${attrs}-->\n` +
                   indent(render(name, opts), pad) + '\n' +
                   pad + `<!-- @end:${name} -->`;
        });
    }

    if (!sawSentinel) continue;
    touched++;

    if (after !== before) {
        changed.push(file);
        if (!CHECK) fs.writeFileSync(full, after);
    }
}

if (CHECK) {
    if (changed.length) {
        console.error('Partials have drifted in:\n  ' + changed.join('\n  '));
        console.error('\nRun: node tools/sync-partials.js');
        process.exit(1);
    }
    console.log(`OK — partials in sync across ${touched} page(s).`);
} else {
    console.log(changed.length
        ? `Rewrote partials in ${changed.length} of ${touched} page(s):\n  ${changed.join('\n  ')}`
        : `No changes — partials already in sync across ${touched} page(s).`);
}
