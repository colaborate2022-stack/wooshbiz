/* ==========================================================================
   Woosh Biz — scroll-driven 3D motion engine
   --------------------------------------------------------------------------
   Replaces the site's hover-only 3D effects with motion driven by scroll
   position, so everything works the same on a phone as it does on a desktop.

   What it does
     • Cards rise out of depth as they scroll in, and recede as they leave.
     • Whichever cards are crossing the middle of the viewport get `.w3d-focus`
       — the scroll equivalent of :hover. Each page mirrors its own hover
       styling onto that class.
     • Scroll velocity adds a subtle sideways swing, so fast flicks on a phone
       feel physical.
     • Horizontal carousels get a cover-flow turn driven by swipe position.
     • Hero art (phone mock-up, map illustration) tilts as it travels through
       the viewport instead of only under a mouse.
     • Mouse tilt is still layered on top for fine pointers.

   How it stays cheap
     • One rAF loop, shared by every element.
     • Only elements near the viewport are updated (IntersectionObserver).
     • All getBoundingClientRect() reads happen in one pass before any style
       write, so there is no layout thrashing.
     • The loop parks itself ~half a second after scrolling stops.
     • It only ever writes CSS custom properties, never `transform`, so page
       CSS keeps full control of composition.

   Opt out of a whole page with <html data-w3d-off>.
   Opt a single element out with class="w3d-static".
   ========================================================================== */
(function () {
    'use strict';

    if (window.__wooshMotion) return;
    window.__wooshMotion = true;

    var D = document;
    var W = window;
    var root = D.documentElement;

    if (root.hasAttribute('data-w3d-off')) return;

    var fine = W.matchMedia('(pointer: fine)').matches;
    var reduced = W.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ----------------------------------------------------------------------
       Chrome that every page gets, regardless of motion preference
       ---------------------------------------------------------------------- */

    var nav = D.querySelector('.navbar') || D.querySelector('nav');
    var bar = D.createElement('div');

    bar.className = 'w3d-progress';

    if (nav) {
        nav.classList.add('w3d-nav');
        // Riding inside the nav beats sitting at a hard-coded `top`: the line
        // then tracks the bar through the taller mobile nav, through the sticky
        // navs on the blog pages, and through the visual-viewport pin below —
        // with no measuring and nothing left to drift out of sync.
        bar.classList.add('w3d-progress-in-nav');
        nav.appendChild(bar);
    } else {
        D.body.appendChild(bar);
    }

    function chrome() {
        var y = W.pageYOffset || root.scrollTop || 0;
        var span = root.scrollHeight - W.innerHeight;
        bar.style.width = (span > 0 ? (y / span) * 100 : 0) + '%';
        if (nav) nav.classList.toggle('w3d-stuck', y > 8);
    }

    W.addEventListener('scroll', chrome, { passive: true });
    chrome();

    /* ----------------------------------------------------------------------
       Keeping the nav welded to the top of a phone screen

       A `position: fixed` bar is pinned to the LAYOUT viewport, not to the part
       of the page you can actually see. While a mobile browser collapses its
       address bar on a downward scroll those two disagree, and the nav slides
       partly off the top edge for the length of that animation before snapping
       back — the "navbar hides a little bit when I scroll down" everyone sees.

       visualViewport.offsetTop is exactly that disagreement, in pixels, so
       handing it back as a translate cancels it out frame for frame.

       On desktop, and on the browsers that keep the two viewports in step, the
       offset is always 0 and this reduces to translate3d(0,0,0) — which is
       still worth having: it puts the nav on its own compositor layer, so it is
       re-drawn with the scroll rather than a frame or two behind it.
       ---------------------------------------------------------------------- */
    if (nav) {
        var vv = W.visualViewport;
        var navFixed = getComputedStyle(nav).position === 'fixed';
        var pinned = -1;

        var pin = function () {
            var t = (navFixed && vv) ? Math.max(0, vv.offsetTop) : 0;
            if (t === pinned) return;
            pinned = t;
            nav.style.transform = 'translate3d(0,' + t + 'px,0)';
        };

        pin();

        if (vv) {
            vv.addEventListener('resize', pin, { passive: true });
            vv.addEventListener('scroll', pin, { passive: true });
        }

        W.addEventListener('resize', function () {
            // A media query can swap the nav between fixed and sticky.
            navFixed = getComputedStyle(nav).position === 'fixed';
            pin();
        }, { passive: true });
    }

    // Reduced motion: chrome only, no 3D at all.
    if (reduced) return;

    /* ----------------------------------------------------------------------
       What gets 3D
       ---------------------------------------------------------------------- */

    // Card-like blocks: full depth pass + scroll-focus + pointer tilt.
    var CARDS = [
        '.resort-card', '.feature-card', '.why-card', '.team-card',
        '.video-card', '.program-card', '.testimonial-card', '.duration-card',
        '.gallery-item', '.blog-card', '.featured-card', '.faq-item', '.step',
        '.contact-grid .card', '.address-card', '.planner-card',
        '.newsletter-card', '.stat-item', '.philosophy-image', '.cover-image'
    ].join(',');

    // Text and supporting blocks: a gentler lift that settles and stays put,
    // so long-form copy never wobbles while you read it.
    var RISE = [
        '.section-heading', '.section-subheading', '.section-label',
        '.how-heading', '.faq-heading', '.about-content', '.philosophy-text',
        '.philosophy-quote', '.hero-intro', '.blog-hero h1', '.blog-hero p',
        '.cta-strip h2', '.cta-strip p', '.cta-strip .cta-buttons',
        '.article-body > p', '.article-body > h2', '.article-body > h3',
        '.article-body > ul', '.article-body > ol', '.article-body > blockquote',
        '.article-meta', '.share-bar', '.form-group',
        '.footer-column', '.footer-grid > div', '.support-inner',
        '.reveal', '.reveal-3d', '.rv'
    ].join(',');

    // Layers that used to tilt under the mouse only.
    var LAYERS = '.phone-3d, .illustration-3d';

    // Never animate anything living inside these.
    var SKIP_IN = '.marquee, .lightbox, .navbar, nav, .dropdown-menu,' +
                  '.carousel-nav, .scroll-to-top, .w3d-static';

    /* ----------------------------------------------------------------------
       Item registry
       ---------------------------------------------------------------------- */

    var items = [];
    var live = [];           // items currently near the viewport
    var scrollers = [];      // horizontal carousels we listen to

    function register(el, kind) {
        if (!el || el.__w3d) return;
        if (el.closest(SKIP_IN)) return;

        // Nesting two depth passes would move the inner element twice, so
        // whichever one is registered first wins. Cards are registered before
        // text blocks precisely so the card is the one that moves. Layers are
        // exempt in both directions — a layer inside a card is the whole point:
        // the card carries the depth pass, the layer turns inside it.
        var NEST = '.w3d-card, .w3d-rise';
        if (kind !== 'layer') {
            if (el.parentNode && el.parentNode.closest && el.parentNode.closest(NEST)) return;
            if (el.querySelector(NEST)) return;
        }

        var cs = getComputedStyle(el);

        // Anything with its own CSS animation already owns its transform —
        // fighting it would break the existing entrance animations.
        if (kind !== 'layer' && cs.animationName !== 'none') return;
        if (cs.position === 'fixed' || cs.position === 'sticky') return;
        if (cs.display === 'inline') return;

        var it = {
            el: el,
            kind: kind,
            // Only take over opacity where the page already hides the element,
            // so a JS failure can never leave visible content stuck at zero.
            fades: el.classList.contains('reveal') ||
                   el.classList.contains('reveal-3d') ||
                   el.classList.contains('rv'),
            offset: 0,      // per-item stagger
            scroller: null, // horizontal carousel, if any
            focus: false,
            settled: false,
            near: false,
            fs: 1,          // smoothed focus scale
            prx: 0, pry: 0, // current pointer tilt
            trx: 0, try_: 0 // target pointer tilt
        };

        // Cascade siblings across a row rather than firing a whole grid at once.
        var sibs = el.parentNode ? el.parentNode.children : null;
        if (sibs) {
            var i = Array.prototype.indexOf.call(sibs, el);
            if (i > 0) it.offset = (i % 4) * 0.05;
        }

        el.classList.add('w3d');
        if (kind === 'card') el.classList.add('w3d-card');
        if (kind === 'rise') el.classList.add('w3d-rise');
        if (kind === 'layer') el.classList.add('w3d-layer');
        // .w3d-fade is deliberately added later, by prime(), once the element's
        // opacity has already been computed.

        el.__w3d = it;
        items.push(it);
    }

    // A layer sits inside an element that already declares `perspective`, and
    // .illustration-3d ships a float animation that would fight the transform.
    D.querySelectorAll(LAYERS).forEach(function (el) {
        el.style.animation = 'none';
        register(el, 'layer');
    });

    D.querySelectorAll(CARDS).forEach(function (el) { register(el, 'card'); });
    D.querySelectorAll(RISE).forEach(function (el) { register(el, 'rise'); });

    if (!items.length) return;

    /* ----------------------------------------------------------------------
       Horizontal carousels (testimonials strip) get a cover-flow turn
       ---------------------------------------------------------------------- */

    function findScroller(el) {
        var p = el.parentNode;
        while (p && p.nodeType === 1 && p !== D.body) {
            var ox = getComputedStyle(p).overflowX;
            if ((ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth + 8) {
                return p;
            }
            p = p.parentNode;
        }
        return null;
    }

    items.forEach(function (it) {
        if (it.kind !== 'card') return;
        var sc = findScroller(it.el);
        if (!sc) return;
        it.scroller = sc;
        if (scrollers.indexOf(sc) === -1) {
            scrollers.push(sc);
            sc.addEventListener('scroll', kick, { passive: true });
        }
    });

    /* ----------------------------------------------------------------------
       Pointer tilt — additive, fine pointers only, never load-bearing
       ---------------------------------------------------------------------- */

    if (fine) {
        items.forEach(function (it) {
            if (it.kind === 'rise') return;
            var host = it.kind === 'layer' ? (it.el.parentNode || it.el) : it.el;

            host.addEventListener('mousemove', function (e) {
                var r = host.getBoundingClientRect();
                var px = (e.clientX - r.left) / r.width - 0.5;
                var py = (e.clientY - r.top) / r.height - 0.5;
                var amp = it.kind === 'layer' ? 20 : 11;
                it.trx = -py * amp;
                it.try_ = px * (amp + 4);
                kick();
            });

            host.addEventListener('mouseleave', function () {
                it.trx = 0;
                it.try_ = 0;
                kick();
            });
        });
    }

    /* ----------------------------------------------------------------------
       Viewport tracking
       ---------------------------------------------------------------------- */

    function rebuild() {
        live.length = 0;
        for (var i = 0; i < items.length; i++) {
            if (items[i].near && !items[i].settled) live.push(items[i]);
        }
    }

    var io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
            var it = entries[i].target.__w3d;
            if (!it) continue;
            it.near = entries[i].isIntersecting;
            entries[i].target.classList.toggle('w3d-live', it.near);
        }
        rebuild();
        kick();
    }, { rootMargin: '30% 0px 30% 0px', threshold: 0 });

    /* ----------------------------------------------------------------------
       The loop
       ---------------------------------------------------------------------- */

    var vh = W.innerHeight || 800;
    var lastY = W.pageYOffset || 0;
    var sway = 0;
    var idle = 0;
    var raf = 0;
    var rects = [];
    var boxes = [];
    var froze = false;
    var slack = 0;   // how many pixels of scroll are still left below us

    function measureSlack() {
        var y = W.pageYOffset || root.scrollTop || 0;
        slack = Math.max(0, (root.scrollHeight - vh) - y);
    }

    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
    function unit(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
    function easeOut(t) { var u = 1 - t; return 1 - u * u * u; }

    function kick() {
        idle = 0;
        if (!raf) raf = requestAnimationFrame(tick);
    }

    /* Position one element from its own rect. Pure writes — every measurement
       it needs is handed in, so callers can batch all their reads first. */
    function paint(it, r, cb) {
        // Progress of this element across the viewport: 0 when its reference
        // point sits on the bottom edge, 1 when it reaches the top.
        var h = Math.min(r.height, vh * 0.8);
        var p = 1 - (r.top + h / 2) / vh;

        // How far up this element can *ever* travel, given how much scroll is
        // left in the document. Without this the footer — which never rises
        // past the lower half of the screen — would sit permanently half faded
        // and half offset. Elements with room to spare get the normal 0.45
        // window; the ones near the end of the page get a compressed one so
        // they still arrive fully.
        var reach = 1 - (r.top - slack + h / 2) / vh;
        var span = Math.min(0.45, Math.max(0.12, reach - it.offset));

        var enter = easeOut(unit((p - it.offset) / span));
        var leave = unit((p - 0.88) / 0.35);
        var busy = false;
        var rx, ry, ty, tz, op;

        if (it.kind === 'layer') {
            // Turns continuously as it travels — there is no single "correct"
            // resting pose, which is exactly what the mouse tilt used to give.
            rx = (p - 0.5) * -18;
            ry = (p - 0.5) * 14 + sway * 1.4;
            ty = 0;
            tz = -Math.abs(p - 0.5) * 50;
            op = 1;

        } else if (it.kind === 'card') {
            rx = (1 - enter) * 13 - leave * 4;
            ry = sway;
            ty = (1 - enter) * 44;
            tz = (1 - enter) * -150 - leave * 60;
            op = unit(0.05 + enter * 1.2) * (1 - leave * 0.28);

        } else {
            // Text: lift in, settle, stay. No exit motion — copy that keeps
            // moving while you are reading it is just annoying.
            rx = (1 - enter) * 7;
            ry = sway * 0.35;
            ty = (1 - enter) * 26;
            tz = (1 - enter) * -60;
            op = unit(enter * 1.2);
        }

        // Cover-flow turn for anything sitting in a horizontal carousel.
        var focused = false;
        if (it.scroller && cb) {
            var cx = clamp((r.left + r.width / 2 - cb.left) / cb.width - 0.5, -0.9, 0.9);
            ry += -cx * 20;
            tz += -Math.abs(cx) * 90;
            // No vertical offset in here: the carousel clips its own overflow,
            // so a card sliding downwards would just push its scroll height out.
            ty = 0;
            focused = Math.abs(cx) < 0.18 && enter > 0.6;
        } else if (it.kind === 'card') {
            // The scroll-focus band — this is the hover replacement. Blocks
            // taller than most of the viewport (form panels, full-width bands)
            // sit it out: nudging those while someone is filling in a field or
            // reading them is just noise.
            focused = r.height < vh * 0.7 &&
                      Math.abs(p - Math.min(0.48, reach)) < 0.20;
        }

        if (focused !== it.focus) {
            it.focus = focused;
            it.el.classList.toggle('w3d-focus', focused);
        }

        // Smoothed focus lift, plus any pointer tilt, folded into the same
        // values so there is only ever one transform per element.
        var fsTarget = focused ? 1.03 : 1;
        it.fs += (fsTarget - it.fs) * 0.12;
        it.prx += (it.trx - it.prx) * 0.18;
        it.pry += (it.try_ - it.pry) * 0.18;

        if (Math.abs(fsTarget - it.fs) > 0.0008) busy = true;
        if (Math.abs(it.trx - it.prx) > 0.05 || Math.abs(it.try_ - it.pry) > 0.05) busy = true;

        rx += it.prx;
        ry += it.pry;

        var s = it.el.style;

        // Text blocks are done for good once they have arrived. Dropping them
        // keeps the per-frame set small on long pages.
        if (it.kind === 'rise' && enter >= 0.999 && !it.scroller) {
            it.settled = true;
            froze = true;
            io.unobserve(it.el);
            it.el.classList.remove('w3d-live');
            s.setProperty('--w3d-rx', '0deg');
            s.setProperty('--w3d-ry', '0deg');
            s.setProperty('--w3d-y', '0px');
            s.setProperty('--w3d-z', '0px');
            s.setProperty('--w3d-s', '1');
            if (it.fades) s.setProperty('--w3d-o', '1');
            return false;
        }

        s.setProperty('--w3d-rx', rx.toFixed(2) + 'deg');
        s.setProperty('--w3d-ry', ry.toFixed(2) + 'deg');
        s.setProperty('--w3d-y', ty.toFixed(1) + 'px');
        s.setProperty('--w3d-z', tz.toFixed(1) + 'px');
        if (it.kind !== 'layer') s.setProperty('--w3d-s', it.fs.toFixed(4));
        if (it.fades) s.setProperty('--w3d-o', op.toFixed(3));

        return busy;
    }

    function tick() {
        raf = 0;

        var y = W.pageYOffset || root.scrollTop || 0;
        var dy = y - lastY;
        lastY = y;

        // Scroll velocity becomes a damped sideways swing. This is what makes
        // a flick on a phone feel like it actually moved something.
        sway += (clamp(dy * 0.10, -3.2, 3.2) - sway) * 0.16;

        var n = live.length;
        var i;
        var busy = Math.abs(dy) > 0.4 || Math.abs(sway) > 0.04;

        froze = false;

        /* ---- read pass: every measurement first, no writes in between ---- */
        measureSlack();
        for (i = 0; i < n; i++) {
            rects[i] = live[i].el.getBoundingClientRect();
            boxes[i] = live[i].scroller ? live[i].scroller.getBoundingClientRect() : null;
        }

        /* ---- write pass ---- */
        for (i = 0; i < n; i++) {
            if (paint(live[i], rects[i], boxes[i])) busy = true;
        }

        if (froze) rebuild();

        // Park the loop once nothing is moving; the next scroll wakes it up.
        idle = busy ? 0 : idle + 1;
        if (idle > 30 || live.length === 0) return;
        // A scroll event fired mid-tick may already have queued the next frame.
        if (!raf) raf = requestAnimationFrame(tick);
    }

    /* ----------------------------------------------------------------------
       First pass, run synchronously
       Every element is positioned before the engine is allowed to take over
       opacity, so nothing that the page had hidden can flash into view for a
       frame while waiting for the first animation frame.
       ---------------------------------------------------------------------- */
    function prime(list) {
        var rs = [], bs = [], i;

        measureSlack();
        for (i = 0; i < list.length; i++) {
            rs[i] = list[i].el.getBoundingClientRect();
            bs[i] = list[i].scroller ? list[i].scroller.getBoundingClientRect() : null;
        }
        for (i = 0; i < list.length; i++) {
            paint(list[i], rs[i], bs[i]);
        }
        for (i = 0; i < list.length; i++) {
            if (list[i].fades) list[i].el.classList.add('w3d-fade');
            if (!list[i].settled) io.observe(list[i].el);
        }
    }
    prime(items);

    W.addEventListener('scroll', kick, { passive: true });
    W.addEventListener('resize', function () {
        vh = W.innerHeight || 800;
        kick();
    }, { passive: true });

    // Late-loading images change layout; re-measure once everything has landed.
    W.addEventListener('load', kick);

    // Handle for checking what got picked up on a page:
    //   wooshMotion.count()  ->  { card: n, rise: n, layer: n }
    W.wooshMotion = {
        items: items,
        count: function () {
            var out = { card: 0, rise: 0, layer: 0 };
            items.forEach(function (it) { out[it.kind]++; });
            return out;
        },
        refresh: kick,

        // Pick up elements that arrived after load — the blog grid renders its
        // cards from a fetch, so they miss the pass that runs at startup.
        // Already-registered elements are skipped, so calling this repeatedly
        // (e.g. after each "Load more") only ever costs the new ones.
        scan: function (root) {
            var scope = root || D;
            var before = items.length;
            scope.querySelectorAll(CARDS).forEach(function (el) { register(el, 'card'); });
            scope.querySelectorAll(RISE).forEach(function (el) { register(el, 'rise'); });
            var added = items.slice(before);
            if (added.length) { prime(added); kick(); }
            return added.length;
        }
    };

    kick();
})();