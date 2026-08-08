/* ==========================================================================
   Woosh Biz — shared page behaviour
   --------------------------------------------------------------------------
   The eight behaviours that were copy-pasted into every page's inline
   <script>: hamburger, marquee, FAQ accordion, stat count-up, scroll-to-top,
   magnetic buttons, YouTube facade, lightbox.

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
})();
