/* ==========================================================================
   faq-text — read an FAQ out of a page the way a crawler would
   --------------------------------------------------------------------------
   Shared by the two tools that both have to agree, exactly, about what a
   visible FAQ answer says:

       check-schema.js    the judge — fails the build when a page's FAQPage
                          schema and its visible answers have drifted apart
       gen-faq-schema.js  the typist — writes that schema from the markup

   They were briefly two copies of this code. That is the same trap
   check-schema exists to police, one level down: the day one copy learns a
   new entity and the other does not, the generator writes text the checker
   rejects, and the only symptom is a build failure nobody can reproduce by
   reading either file. One definition, imported twice.

   No dependencies. Node stdlib only.
   ========================================================================== */

'use strict';

/* One .faq-item: [1] the question, [2] the answer, both still HTML. */
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

/**
 * Every .faq-item on a page, as { question, answer } of visible text.
 * Returns [] for a page with no FAQ markup.
 */
function faqItems(html) {
    const out = [];
    let m;
    // The regex is module-level and /g, so it carries lastIndex between calls.
    FAQ_ITEM_RE.lastIndex = 0;
    while ((m = FAQ_ITEM_RE.exec(html)) !== null) {
        out.push({ question: visibleText(m[1]), answer: visibleText(m[2]) });
    }
    return out;
}

module.exports = { FAQ_ITEM_RE, NAMED_ENTITIES, decodeEntities, visibleText, faqItems };
