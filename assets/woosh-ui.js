/* ==========================================================================
   Woosh Biz — shared page behaviour
   --------------------------------------------------------------------------
   The eight behaviours that were copy-pasted into every page's inline
   <script>: hamburger, marquee, FAQ accordion, stat count-up, scroll-to-top,
   magnetic buttons, YouTube facade, lightbox.

   Plus three that were never on any page and belong in exactly one place:
   conversion tracking, the floating WhatsApp CTA, and the WhatsApp pre-fill.
   Those three share a "which page, which card" helper and sit together at the
   bottom of the file.

   Every block below is an independent self-guarding IIFE: if the markup it
   drives isn't on the page, it returns immediately and costs nothing. So this
   one file can be linked from every page, including pages that use none of it.

   Motion and 3D are NOT here — that is woosh-3d.js, which owns transforms.
   This file only ever touches classes, text and innerHTML.
   ========================================================================== */
(function () {
    'use strict';

    var D = document;
    var W = window;
    var reduced = W.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function all(sel, root) {
        return Array.prototype.slice.call((root || D).querySelectorAll(sel));
    }

    /* ----------------------------------------------------------------------
       Client and press logos

       Kept here rather than in the markup because the same two lists appear on
       several pages, and a marquee needs each list rendered twice for the
       -50% keyframe to loop seamlessly — which is 96 <img> tags of duplicated
       HTML per page if you hand-write it.
       ---------------------------------------------------------------------- */

    var BRANDS = [
        ['572678de', 'Air India'],
        ['950c2ae7', 'Jio Studio'],
        ['9a50dbc2', 'RPG Pvt Ltd'],
        ['8144f80f', 'Accor Hotels'],
        ['1e1761e2', 'Westin Hotels'],
        ['62f68fef', 'Ginger Hotels'],
        ['9093a138', 'Club Mahindra Resorts'],
        ['3133b82e', 'Speciality Restaurants'],
        ['1994cb4e', 'Mainland China'],
        ['9a1d5c82', 'Azure Hospitality'],
        ['8cc8588e', 'ABNAH — Yauatcha, Cin Cin, Nara Thai, Hakkasan'],
        ['46a954cc', "Jolie's Club by Aditya Birla"],
        ['8b54c696', 'Treat Resorts'],
        ['5e57c5fc', 'Peninsula Redpine'],
        ['b8c7da6e', 'VITS Select'],
        ['e2c6ea07', 'Nesco'],
        ['9d916977', 'PolyPeptide'],
        ['3f95d02a', 'Idemitsu Lube India Pvt. Ltd.'],
        ['40256a2a', 'Valmet'],
        ['6af006b6', 'Nelito Systems'],
        ['35da6207', 'Itochu Parekh ISPL'],
        ['cba075cd', 'Parekh Integrated Services Pvt Ltd'],
        ['2c317fb4', 'Swastik Tins'],
        ['418cf1d3', 'Arete'],
        ['cf04087a', 'Wyntronix Innovations'],
        ['9cd097fc', 'Noble Protective Systems'],
        ['b10ae94b', 'Reviv'],
        ['70ef6770', 'Dr Store'],
        ['b6ac6f93', 'The Club'],
        ['13898748', 'BBT'],
        ['1fbe05b6', 'KBT'],
        ['1195b5d2', 'Pillai College of Management Studies'],
        ['3c8c0071', 'Kohinoor College'],
        ['972c1a76', 'MET College'],
        ['3a87c541', 'Hiranandani School'],
        ['c9db98c1', 'ITM IHM'],
        ['42d5e298', 'Apeejay Institute Of Hospitality'],
        ['ef7945b9', 'Anjuman-I-Islam IHMCT'],
        ['5ea0b217', 'Cona & Osum']
    ];

    var PRESS = [
        ['948917f0', 'Business Standard'],
        ['ade98c7a', 'ET Hospitality'],
        ['4a24a4b8', 'Free Press Journal'],
        ['d89495a5', 'The Print'],
        ['290c4247', 'The Week'],
        ['97aea277', 'Financial Express'],
        ['9e0a9102', 'DNA'],
        ['e03da0b9', 'The Times of India']
    ];

    W.WooshLogos = { BRANDS: BRANDS, PRESS: PRESS };

    /* ----------------------------------------------------------------------
       Marquee tracks

       <div class="marquee-track" data-logos="brands"></div>
       <div class="marquee-track" data-logos="brands-a|brands-b|press"></div>

       brands-a / brands-b split the client list across two counter-scrolling
       rows. width/height are written as attributes to reserve layout space so
       the strip does not jump as logos arrive; the CSS does the real sizing.
       ---------------------------------------------------------------------- */
    (function () {
        var tracks = all('[data-logos]');
        if (!tracks.length) return;

        var half = Math.ceil(BRANDS.length / 2);
        var LISTS = {
            'brands': BRANDS,
            'brands-a': BRANDS.slice(0, half),
            'brands-b': BRANDS.slice(half),
            'press': PRESS
        };

        function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

        tracks.forEach(function (el) {
            var list = LISTS[el.getAttribute('data-logos')];
            if (!list) return;

            var w = el.getAttribute('data-logo-w') || 134;
            var h = el.getAttribute('data-logo-h') || 62;

            var html = list.map(function (pair) {
                var name = esc(pair[1]);
                return '<img src="images/wix/wix-' + pair[0] + '.png" alt="' + name +
                       '" title="' + name + '" loading="lazy" width="' + w +
                       '" height="' + h + '" data-logo>';
            }).join('');

            // Rendered twice so the -50% keyframe loops seamlessly.
            el.innerHTML = html + html;
        });

        // A missing logo should leave a gap, not a broken-image glyph mid-strip.
        all('img[data-logo]').forEach(function (img) {
            img.addEventListener('error', function () { img.style.display = 'none'; });
        });
    })();

    /* ----------------------------------------------------------------------
       Hamburger / mobile navigation
       ---------------------------------------------------------------------- */
    (function () {
        var burger = D.getElementById('hamburger');
        var links = D.getElementById('navLinks');
        if (!burger || !links) return;

        var dropdown = D.querySelector('.dropdown');
        var toggle = D.querySelector('.dropdown-toggle');

        function close() {
            burger.classList.remove('active');
            links.classList.remove('open');
            if (dropdown) dropdown.classList.remove('open');
            D.body.style.overflow = '';
            burger.setAttribute('aria-expanded', 'false');
        }

        burger.setAttribute('aria-expanded', 'false');

        burger.addEventListener('click', function () {
            var open = !links.classList.contains('open');
            burger.classList.toggle('active', open);
            links.classList.toggle('open', open);
            // Locking the body is what stops the page scrolling behind an open
            // full-screen menu on iOS.
            D.body.style.overflow = open ? 'hidden' : '';
            burger.setAttribute('aria-expanded', String(open));
        });

        // The dropdown opens on hover at desktop widths; on touch it needs a tap,
        // and that tap must not follow the parent's href.
        if (toggle && dropdown) {
            toggle.addEventListener('click', function (e) {
                if (W.innerWidth > 968) return;
                e.preventDefault();
                dropdown.classList.toggle('open');
            });
        }

        all('#navLinks a').forEach(function (a) {
            a.addEventListener('click', function () {
                if (a.classList.contains('dropdown-toggle')) return;
                close();
            });
        });

        D.addEventListener('click', function (e) {
            if (!links.classList.contains('open')) return;
            if (links.contains(e.target) || burger.contains(e.target)) return;
            close();
        });

        D.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') close();
        });

        W.addEventListener('resize', function () {
            if (W.innerWidth > 968) close();
        }, { passive: true });
    })();

    /* ----------------------------------------------------------------------
       FAQ accordion — one open at a time
       ---------------------------------------------------------------------- */
    (function () {
        var items = all('.faq-item');
        if (!items.length) return;

        items.forEach(function (item) {
            var q = item.querySelector('.faq-question');
            if (!q) return;

            // Keyboard-operable and announced, which the click-only original
            // was not.
            q.setAttribute('role', 'button');
            q.setAttribute('tabindex', '0');
            q.setAttribute('aria-expanded', 'false');

            function toggle(e) {
                // Let a link inside an answer behave like a link.
                if (e && e.target && e.target.closest('a')) return;
                var open = !item.classList.contains('active');
                items.forEach(function (i) {
                    i.classList.remove('active');
                    var iq = i.querySelector('.faq-question');
                    if (iq) iq.setAttribute('aria-expanded', 'false');
                });
                item.classList.toggle('active', open);
                q.setAttribute('aria-expanded', String(open));
            }

            item.addEventListener('click', toggle);
            q.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
            });
        });
    })();

    /* ----------------------------------------------------------------------
       Stat count-up — once, when the number scrolls into view
       ---------------------------------------------------------------------- */
    (function () {
        var nums = all('.stat-number[data-count]');
        if (!nums.length) return;

        if (reduced) {
            nums.forEach(function (el) {
                el.textContent = el.dataset.count + (el.dataset.suffix || '');
            });
            return;
        }

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                io.unobserve(entry.target);

                var el = entry.target;
                var target = parseInt(el.dataset.count, 10);
                var suffix = el.dataset.suffix || '';
                var start = performance.now();

                (function step(now) {
                    var p = Math.min((now - start) / 1400, 1);
                    el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))) + suffix;
                    if (p < 1) requestAnimationFrame(step);
                })(start);
            });
        }, { threshold: 0.4 });

        nums.forEach(function (el) { io.observe(el); });
    })();

    /* ----------------------------------------------------------------------
       Scroll-to-top
       ---------------------------------------------------------------------- */
    (function () {
        var btn = D.getElementById('scrollToTop') || D.querySelector('.scroll-to-top');
        if (!btn) return;

        W.addEventListener('scroll', function () {
            btn.classList.toggle('visible', (W.pageYOffset || 0) > 500);
        }, { passive: true });

        btn.addEventListener('click', function () {
            W.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
        });
    })();

    /* ----------------------------------------------------------------------
       Magnetic buttons — fine pointers only, never load-bearing
       ---------------------------------------------------------------------- */
    (function () {
        if (reduced || !W.matchMedia('(pointer: fine)').matches) return;

        all('[data-magnetic]').forEach(function (el) {
            var rect = null;

            el.addEventListener('mouseenter', function () { rect = el.getBoundingClientRect(); });
            el.addEventListener('mousemove', function (e) {
                if (!rect) return;
                var x = (e.clientX - rect.left - rect.width / 2) * 0.28;
                var y = (e.clientY - rect.top - rect.height / 2) * 0.4;
                el.style.setProperty('--mag-x', x.toFixed(1) + 'px');
                el.style.setProperty('--mag-y', y.toFixed(1) + 'px');
            });
            el.addEventListener('mouseleave', function () {
                rect = null;
                el.style.setProperty('--mag-x', '0px');
                el.style.setProperty('--mag-y', '0px');
            });
        });
    })();

    /* ----------------------------------------------------------------------
       YouTube facade

       <div data-yt="VIDEO_ID" data-title="..."></div>

       Renders a thumbnail plus a play button; the iframe is only built on
       click. Keeps the page fast and keeps a dozen YouTube cookies off it
       until someone actually asks for a video.
       ---------------------------------------------------------------------- */
    (function () {
        var slots = all('[data-yt]');
        if (!slots.length) return;

        // YouTube refuses to embed on a file:// origin (its "Error 153"), so
        // when there is no http origin we send people to YouTube instead.
        var canEmbed = location.protocol === 'http:' || location.protocol === 'https:';

        slots.forEach(function (slot) {
            var id = slot.getAttribute('data-yt');
            var title = slot.getAttribute('data-title') || 'Woosh Biz video';

            var btn = D.createElement(canEmbed ? 'button' : 'a');
            btn.className = 'yt';
            btn.setAttribute('aria-label', 'Play: ' + title);
            if (canEmbed) { btn.type = 'button'; }
            else {
                btn.href = 'https://www.youtube.com/watch?v=' + id;
                btn.target = '_blank';
                btn.rel = 'noopener';
            }

            btn.innerHTML =
                '<img class="yt-thumb" src="https://i.ytimg.com/vi/' + id + '/hqdefault.jpg" alt="' +
                title.replace(/"/g, '&quot;') + '" loading="lazy" width="480" height="360">' +
                '<span class="yt-play" aria-hidden="true">&#9654;</span>' +
                '<span class="yt-label">' + title + '</span>';

            if (canEmbed) {
                btn.addEventListener('click', function () {
                    var f = D.createElement('iframe');
                    f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0';
                    f.title = title;
                    f.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
                    f.allowFullscreen = true;
                    f.loading = 'lazy';
                    btn.replaceWith(f);
                });
            }

            slot.appendChild(btn);
        });
    })();

    /* ----------------------------------------------------------------------
       Lightbox

           <a data-lightbox href="full.jpg" data-caption="…">
           <button data-lightbox="full.jpg" data-caption="…">

       Every trigger on the page forms one gallery in document order, so the
       arrows and the arrow keys step between them.
       ---------------------------------------------------------------------- */
    (function () {
        var triggers = all('[data-lightbox]');
        if (!triggers.length) return;

        var box = D.createElement('div');
        box.className = 'lightbox';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        box.innerHTML =
            '<button class="lightbox-close" aria-label="Close">&times;</button>' +
            '<button class="lightbox-nav lightbox-prev" aria-label="Previous image">&#8249;</button>' +
            '<button class="lightbox-nav lightbox-next" aria-label="Next image">&#8250;</button>' +
            '<figure class="lightbox-figure"><img alt=""><figcaption></figcaption></figure>';
        D.body.appendChild(box);

        var img = box.querySelector('img');
        var cap = box.querySelector('figcaption');
        var closeBtn = box.querySelector('.lightbox-close');
        var lastFocus = null;
        var index = 0;

        // A single image needs no arrows.
        if (triggers.length < 2) {
            box.querySelector('.lightbox-prev').hidden = true;
            box.querySelector('.lightbox-next').hidden = true;
        }

        function srcOf(t) { return t.getAttribute('href') || t.getAttribute('data-lightbox'); }

        function show(i) {
            index = (i + triggers.length) % triggers.length;
            var t = triggers[index];
            var inner = t.querySelector('img');
            img.src = srcOf(t);
            img.alt = inner ? inner.alt : '';
            var text = t.getAttribute('data-caption') || (inner ? inner.alt : '');
            cap.textContent = text;
            cap.hidden = !text;
        }

        function open(i) {
            lastFocus = D.activeElement;
            show(i);
            box.classList.add('open');
            D.body.style.overflow = 'hidden';
            closeBtn.focus();
        }

        function close() {
            box.classList.remove('open');
            D.body.style.overflow = '';
            img.src = '';
            if (lastFocus && lastFocus.focus) lastFocus.focus();
        }

        triggers.forEach(function (t, i) {
            t.addEventListener('click', function (e) { e.preventDefault(); open(i); });
        });

        box.addEventListener('click', function (e) {
            if (e.target.closest('.lightbox-prev')) return show(index - 1);
            if (e.target.closest('.lightbox-next')) return show(index + 1);
            if (e.target === box || e.target.closest('.lightbox-close')) close();
        });

        D.addEventListener('keydown', function (e) {
            if (!box.classList.contains('open')) return;
            if (e.key === 'Escape') close();
            if (e.key === 'ArrowLeft') show(index - 1);
            if (e.key === 'ArrowRight') show(index + 1);
        });
    })();

    /* ----------------------------------------------------------------------
       Filter chips + search over a card list

           <div data-filter-for="venueList" data-filter-key="region"></div>
           <input data-filter-search="venueList">
           <div id="venueList"> <article data-region="Mumbai" data-name="…"> …

       Chips are built from the cards' own data-* values, so the counts can
       never drift out of sync with what is actually on the page.
       ---------------------------------------------------------------------- */
    (function () {
        var mounts = all('[data-filter-for]');
        if (!mounts.length) return;

        mounts.forEach(function (chipBox) {
            var list = D.getElementById(chipBox.getAttribute('data-filter-for'));
            if (!list) return;

            var key = chipBox.getAttribute('data-filter-key') || 'region';
            var search = D.querySelector('[data-filter-search="' + list.id + '"]');
            var empty = D.querySelector('[data-filter-empty="' + list.id + '"]');
            var cards = all(':scope > *', list);
            var current = '*';

            var counts = { '*': cards.length };
            cards.forEach(function (c) {
                var v = c.dataset[key];
                if (v) counts[v] = (counts[v] || 0) + 1;
            });

            Object.keys(counts).forEach(function (v) {
                var b = D.createElement('button');
                b.type = 'button';
                b.className = 'chip' + (v === '*' ? ' active' : '');
                b.dataset.value = v;
                b.setAttribute('aria-pressed', String(v === '*'));
                b.innerHTML = (v === '*' ? 'All' : v) + ' <span class="chip-count">' + counts[v] + '</span>';
                chipBox.appendChild(b);
            });

            function apply() {
                var q = (search && search.value || '').trim().toLowerCase();
                var shown = 0;

                cards.forEach(function (c) {
                    var okChip = current === '*' || c.dataset[key] === current;
                    var okText = !q || c.textContent.toLowerCase().indexOf(q) > -1;
                    var show = okChip && okText;
                    // display:none rather than opacity so the grid re-packs.
                    c.hidden = !show;
                    if (show) shown++;
                });

                if (empty) empty.hidden = shown > 0;
                if (W.wooshMotion) W.wooshMotion.refresh();
            }

            chipBox.addEventListener('click', function (e) {
                var b = e.target.closest('.chip');
                if (!b) return;
                current = b.dataset.value;
                all('.chip', chipBox).forEach(function (c) {
                    var on = c === b;
                    c.classList.toggle('active', on);
                    c.setAttribute('aria-pressed', String(on));
                });
                apply();
            });

            if (search) search.addEventListener('input', apply);
        });
    })();

    /* ----------------------------------------------------------------------
       Lead context

       Two blocks below need the same answer to "which page is this, and which
       card was the visitor looking at" — the WhatsApp pre-fill and the
       analytics events. Working it out once here keeps the two consistent, so
       a lead's WhatsApp opener and its GA4 row always name the same source.
       ---------------------------------------------------------------------- */

    var PAGE_LABELS = {
        'index.html':       'Home',
        'high-octane.html': 'In-Office programmes',
        'outdoors.html':    'Outdoor programmes',
        'resorts.html':     'Resorts we recommend',
        'about.html':       'About us',
        'contact.html':     'Contact',
        'blog.html':        'Blog',
        'virtual.html':     'Virtual programmes',
        '404.html':         'Page not found'
    };

    var pageLabel = (function () {
        var path = W.location.pathname;
        // A trailing slash leaves an empty last segment. Only the site root
        // means the home page — every blog post is served from its own folder
        // as /slug/, and those must fall through to the heading below rather
        // than all reporting themselves as Home.
        var file = path.split('/').pop() || (path === '/' ? 'index.html' : '');
        if (file && PAGE_LABELS[file]) return PAGE_LABELS[file];
        // Everything else that carries a CTA is a blog post in its own folder.
        var h1 = D.querySelector('h1');
        var name = ((h1 && h1.textContent) || D.title || '')
            .replace(/\s*[|—-]\s*Woosh Biz.*$/i, '')
            .replace(/\s+/g, ' ')
            .trim();
        return name ? 'Blog: ' + name : 'Blog';
    })();

    /* The nearest thing the visitor was actually reading when they clicked.
       `data-cta-note` wins so a one-off link can name itself; otherwise the
       heading of the card the link sits in. Returns '' for page-level CTAs
       like the hero and closing buttons, which need no further detail. */
    function ctaNote(a) {
        if (a.getAttribute('data-cta-note')) return a.getAttribute('data-cta-note');
        var card = a.closest && a.closest('.venue-card, .frame, .panel, .voice, .module-card');
        if (!card) return '';
        // h3/h4 only. Cards title themselves with an h3; an h2 inside a .panel
        // means the panel is being used as a full-width closing section, and
        // its heading ("Let's chat.") describes the pitch, not a thing the
        // visitor was choosing between.
        var h = card.querySelector('h3, h4');
        return h ? h.textContent.replace(/\s+/g, ' ').trim() : '';
    }

    function isWhatsApp(href) {
        return href.indexOf('wa.me/') > -1 || href.indexOf('api.whatsapp.com') > -1;
    }

    /* ----------------------------------------------------------------------
       Conversion tracking

       GA4 has been loaded on every page since launch and was never told what a
       conversion looks like, so none of the traffic answered the only question
       that matters: which page brings in the work. Every lead action now fires
       a readable named event AND the GA4-standard `generate_lead`, so
       `generate_lead` can be marked as the key event once in the GA4 UI while
       the named events stay legible in reports.

       gtag is guarded rather than assumed: admin.html carries no tag, and any
       blocker removes it everywhere.

       Note for whoever reads the reports: `lead_source` and `lead_detail` are
       custom parameters. GA4 collects them immediately, but they stay out of
       the standard reports until they are registered as custom dimensions
       under Admin → Custom definitions.
       ---------------------------------------------------------------------- */

    W.wooshTrack = function (name, params) {
        if (typeof W.gtag !== 'function') return;
        var data = { lead_source: pageLabel };
        Object.keys(params || {}).forEach(function (k) {
            if (params[k]) data[k] = params[k];
        });
        W.gtag('event', name, data);
        if (name !== 'generate_lead') W.gtag('event', 'generate_lead', data);
    };

    (function () {
        // Capture phase, so a link that stops propagation still gets counted.
        D.addEventListener('click', function (e) {
            var a = e.target && e.target.closest && e.target.closest('a[href]');
            if (!a) return;

            var href = a.getAttribute('href') || '';
            var kind = isWhatsApp(href)              ? 'whatsapp'
                     : href.indexOf('tel:')    === 0 ? 'phone'
                     : href.indexOf('mailto:') === 0 ? 'email'
                     : '';
            if (!kind) return;

            W.wooshTrack(kind + '_click', {
                lead_detail: ctaNote(a),
                link_text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)
            });
        }, true);
    })();

    /* ----------------------------------------------------------------------
       Floating WhatsApp CTA

       The programme pages and the blog posts are long, and the CTA used to
       exist only at the very top and the very bottom of them — a visitor
       convinced somewhere in the middle had nothing to press. This pins one
       to the corner once the hero is off screen.

       Injected rather than pasted into 60-odd files, which also means every
       blog post gets it without the post template changing. Opt a page out
       with <body data-no-cta-float>.
       ---------------------------------------------------------------------- */
    (function () {
        if (D.body.hasAttribute('data-no-cta-float')) return;

        var a = D.createElement('a');
        a.className = 'cta-float';
        a.href = 'https://wa.me/919210804078';
        a.target = '_blank';
        a.rel = 'noopener';
        a.setAttribute('aria-label', 'Get a quote on WhatsApp');
        a.innerHTML =
            '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
            '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.67-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413"/>' +
            '</svg><span>Get a quote</span>';
        D.body.appendChild(a);

        // Same 500px threshold as scroll-to-top, so the two arrive together
        // rather than popping in one at a time.
        W.addEventListener('scroll', function () {
            a.classList.toggle('visible', (W.pageYOffset || 0) > 500);
        }, { passive: true });
    })();

    /* ----------------------------------------------------------------------
       WhatsApp pre-fill

       Every WhatsApp CTA pointed at the same number with an empty message box.
       That costs twice: the visitor has to compose an opener cold, and when
       they do write, the person answering has no idea whether they came off
       the outdoors page or a blog post.

       So each link gets a ?text= at load — a ready-to-send opener plus one
       attribution line. Runs after the float is appended so the float is
       covered too, and skips any link that already carries its own text.

       Exposed as well as run, because contact.html swaps a fresh WhatsApp
       link into the page after a successful enquiry, long after this file has
       finished. That link needs the same treatment, so it calls back in.
       ---------------------------------------------------------------------- */
    W.wooshFillWhatsApp = function (root) {
        all('a[href*="wa.me/"], a[href*="api.whatsapp.com"]', root).forEach(function (a) {
            var href = a.href;
            if (!isWhatsApp(href) || /[?&]text=/.test(href)) return;

            var note = ctaNote(a);
            var msg = 'Hi Woosh Biz! I’d like a quote for a team building programme.\n\n'
                    + 'Coming from: ' + pageLabel + (note ? ' — ' + note : '');

            a.href = href + (href.indexOf('?') > -1 ? '&' : '?') + 'text=' + encodeURIComponent(msg);
        });
    };

    W.wooshFillWhatsApp();
})();
