'use strict';

// ══════════════════════════════════════
// LIGHTBOX STATE
// ──────────────────────────────────────
var lbItems = [];
var lbIndex = 0;

// ══════════════════════════════════════
// LAZY LOAD — Intersection Observer
// ══════════════════════════════════════
var _lazyObserver = null;

function initLazyObserver() {
    if (!('IntersectionObserver' in window)) {
        // Fallback: load all images immediately for old browsers
        document.querySelectorAll('img[data-src]').forEach(forceLoadImg);
        return;
    }

    _lazyObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                forceLoadImg(entry.target);
                _lazyObserver.unobserve(entry.target);
            }
        });
    }, {
        rootMargin: '200px 0px',   // start loading 200px before entering viewport
        threshold: 0
    });
}

function observeImg(img) {
    if (_lazyObserver) {
        _lazyObserver.observe(img);
    } else {
        forceLoadImg(img);
    }
}

function forceLoadImg(img) {
    var src = img.getAttribute('data-src');
    var fallback = img.getAttribute('data-fallback');
    if (!src) return;
    img.src = src;
    img.removeAttribute('data-src');
    img.onerror = function () {
        if (fallback) {
            img.src = fallback;
        }
        img.onerror = null;
    };
}

// ══════════════════════════════════════
// GOOGLE DRIVE GALLERY LOADING
// ══════════════════════════════════════

// Holds the full category data from API: { FolderName: { _images:[], _subs:{} } }
var driveData = {};

function loadGalleryFromDrive() {
    if (typeof SCRIPT_URL === 'undefined' || SCRIPT_URL === 'YOUR_APPS_SCRIPT_URL_HERE') {
        showGalleryError('⚙️ Setup needed: paste your Apps Script URL into index.html');
        return;
    }

    showGalleryLoading(true);
    hideGalleryError();

    fetch(SCRIPT_URL)
        .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function (data) {
            showGalleryLoading(false);
            if (!data.success) throw new Error(data.error || 'Script error');
            driveData = data.categories;
            renderMainFilterButtons();
            renderAllGalleryItems();
            updateHomeStats();
        })
        .catch(function (err) {
            showGalleryLoading(false);
            showGalleryError('Could not load gallery: ' + err.message);
        });
}

// —— Build TOP-LEVEL category buttons (mirrors Drive root folders) ——
function renderMainFilterButtons() {
    var bar = document.getElementById('cat-bar');
    if (!bar) return;
    bar.innerHTML = '';

    // "All" button
    var allBtn = document.createElement('button');
    allBtn.className = 'cat active';
    allBtn.setAttribute('data-filter', 'all');
    allBtn.innerHTML = 'All <i data-lucide="layers" class="cat-icon"></i>';
    allBtn.onclick = function () { onMainCatClick('all', allBtn); };
    bar.appendChild(allBtn);

    // One button per top-level Drive folder
    Object.keys(driveData).forEach(function (catName) {
        var btn = document.createElement('button');
        btn.className = 'cat';
        btn.setAttribute('data-filter', catName);
        btn.innerHTML = '<i data-lucide="image" class="cat-icon"></i> ' + catName;
        btn.onclick = function () { onMainCatClick(catName, btn); };
        bar.appendChild(btn);
    });

    // Sub-bar container (populated dynamically)
    var subBar = document.createElement('div');
    subBar.id = 'dynamic-sub-bar';
    subBar.className = 'sub-cat-bar';
    bar.insertAdjacentElement('afterend', subBar);

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// —— Click handler for main category buttons ——
function onMainCatClick(catName, clickedBtn) {
    // Update active state
    document.querySelectorAll('.cat').forEach(function (b) { b.classList.remove('active'); });
    clickedBtn.classList.add('active');

    var subBar = document.getElementById('dynamic-sub-bar');
    subBar.innerHTML = '';
    subBar.classList.remove('active');

    if (catName === 'all') {
        // Show everything
        filterBySubCat(null, null);
        return;
    }

    var entry = driveData[catName];
    var subs = entry ? Object.keys(entry._subs || {}) : [];

    if (subs.length > 0) {
        // Build sub-category buttons
        subs.forEach(function (subName) {
            var btn = document.createElement('button');
            btn.className = 'sub-cat';
            btn.setAttribute('data-filter', subName);
            btn.innerHTML = subName + ' <i data-lucide="heart" class="btn-inline-icon"></i>';
            btn.onclick = function () {
                document.querySelectorAll('.sub-cat').forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
                filterBySubCat(catName, subName);
            };
            subBar.appendChild(btn);
        });
        subBar.classList.add('active');
        if (typeof lucide !== 'undefined') lucide.createIcons();
        // Show all items in this top-level folder (including all sub-folders)
        filterBySubCat(catName, null);
    } else {
        // No sub-folders — just filter directly
        filterBySubCat(catName, null);
    }
}

// —— Filter gallery items ——
// parent=null + sub=null  → show all
// parent='Cartoon', sub=null → show all Cartoon items
// parent='Cartoon', sub='Jew Teens' → show only Jew Teens
function filterBySubCat(parent, sub) {
    var items = document.querySelectorAll('.gitem');
    var visible = 0;
    items.forEach(function (item, i) {
        var itemParent = item.getAttribute('data-parent');
        var itemSub = item.getAttribute('data-sub');
        var show = false;

        if (parent === null) {
            show = true;
        } else if (sub === null) {
            show = (itemParent === parent);
        } else {
            show = (itemParent === parent && itemSub === sub);
        }

        if (show) {
            visible++;
            item.classList.remove('hide');
            item.style.opacity = '0';
            item.style.transform = 'scale(0.88)';
            item.style.transition = 'opacity .35s ease ' + (i * 0.03) + 's, transform .35s ease ' + (i * 0.03) + 's';
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    item.style.opacity = '1';
                    item.style.transform = '';
                });
            });
        } else {
            item.style.opacity = '0';
            setTimeout(function () { item.classList.add('hide'); }, 360);
        }
    });

    var emptyMsg = document.getElementById('gallery-empty');
    if (emptyMsg) {
        emptyMsg.style.display = visible === 0 ? 'flex' : 'none';
        visible === 0 ? emptyMsg.classList.remove('hide') : emptyMsg.classList.add('hide');
    }

    rebuildLbItems();
}

// —— Render ALL gallery items with data-parent + data-sub attributes ——
function renderAllGalleryItems() {
    var gallery = document.getElementById('gallery');
    gallery.querySelectorAll('.gitem').forEach(function (el) { el.remove(); });

    var totalCount = 0;
    var fragment = document.createDocumentFragment();

    Object.keys(driveData).forEach(function (catName) {
        var entry = driveData[catName];

        // Images directly in top folder
        (entry._images || []).forEach(function (item) {
            totalCount++;
            fragment.appendChild(makeGitem(item, catName, catName));
        });

        // Images in sub-folders
        Object.keys(entry._subs || {}).forEach(function (subName) {
            entry._subs[subName].forEach(function (item) {
                totalCount++;
                fragment.appendChild(makeGitem(item, catName, subName));
            });
        });
    });

    gallery.appendChild(fragment);

    var empty = document.getElementById('gallery-empty');
    if (empty) {
        empty.style.display = totalCount === 0 ? 'flex' : 'none';
        totalCount === 0 ? empty.classList.remove('hide') : empty.classList.add('hide');
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
    rebuildLbItems();
}

// Build a single gallery item element
function makeGitem(item, parent, sub) {
    var div = document.createElement('div');
    div.className = 'gitem';
    div.setAttribute('data-parent', parent);
    div.setAttribute('data-sub', sub);
    div.setAttribute('data-file-id', item.id);
    div.setAttribute('data-src-full', item.url);   // kept for Lightbox
    div.onclick = function () { openLightbox(div); };

    var img = document.createElement('img');
    // Use data-src instead of src — real URL loaded by IntersectionObserver
    img.setAttribute('data-src', item.url);
    img.setAttribute('data-fallback',
        'https://drive.google.com/thumbnail?id=' + item.id + '&sz=w800');
    img.alt = sub;
    img.src = '';  // blank until observed
    img.classList.add('lazy');

    // Observe this image for lazy loading
    observeImg(img);

    var hover = document.createElement('div');
    hover.className = 'ghover';
    hover.innerHTML = '<span><i data-lucide="maximize-2"></i></span><p>' + sub + '</p>';

    div.appendChild(img);
    div.appendChild(hover);
    return div;
}

function showGalleryLoading(show) {
    var el = document.getElementById('gallery-loading');
    if (!el) return;
    el.style.display = show ? 'flex' : 'none';
}

function showGalleryError(msg) {
    var el = document.getElementById('gallery-error');
    var txt = document.getElementById('gallery-error-msg');
    if (!el) return;
    if (txt) txt.textContent = msg;
    el.classList.remove('hide');
    el.style.display = 'flex';
}

function hideGalleryError() {
    var el = document.getElementById('gallery-error');
    if (!el) return;
    el.classList.add('hide');
    el.style.display = 'none';
}

// —— Update Home Stats (Artworks + Categories) ——
function updateHomeStats() {
    var artworksCount = 0;
    var cats = Object.keys(driveData);

    cats.forEach(function (catName) {
        var entry = driveData[catName];
        // Count direct images
        if (entry._images) artworksCount += entry._images.length;
        // Count sub-folder images
        if (entry._subs) {
            Object.keys(entry._subs).forEach(function (sub) {
                artworksCount += entry._subs[sub].length;
            });
        }
    });

    var artEl = document.getElementById('count-artworks');
    var catEl = document.getElementById('count-categories');

    if (artEl) artEl.textContent = artworksCount + (artworksCount >= 100 ? '+' : '');
    if (catEl) catEl.textContent = cats.length;
}


// ══════════════════════════════════════
// WELCOME → ENTER SITE
// ══════════════════════════════════════
function enterSite() {
    var welcome = document.getElementById('welcome-screen');
    var app = document.getElementById('app');

    welcome.classList.add('exit');

    setTimeout(function () {
        welcome.style.display = 'none';
        app.style.display = 'flex';

        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                app.classList.add('visible');
            });
        });
    }, 900);
}

// ══════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════
function goTo(sectionId) {
    var navLink = document.querySelector('.nav-link[data-section="' + sectionId + '"]');
    navigate(sectionId, navLink);
}

function navigate(sectionId, clickedEl) {
    // Update active state - sidebar nav links
    document.querySelectorAll('.nav-link').forEach(function (el) {
        el.classList.remove('active');
    });
    if (clickedEl) clickedEl.classList.add('active');

    // Sync mobile bottom nav
    document.querySelectorAll('.mnav-item').forEach(function (el) {
        el.classList.remove('active');
    });
    var mnavActive = document.querySelector('.mnav-item[data-section="' + sectionId + '"]');
    if (mnavActive) mnavActive.classList.add('active');

    // Show correct section
    document.querySelectorAll('.section').forEach(function (sec) {
        sec.classList.remove('active');
    });
    var target = document.getElementById('section-' + sectionId);
    if (target) {
        target.classList.add('active');
        target.scrollTop = 0;
    }

    // Lazy-load queue on first visit
    if (sectionId === 'queue' && !_queueLoaded) loadQueueFromDrive();
}

// ══════════════════════════════════════
// MOBILE BOTTOM NAV
// ══════════════════════════════════════
function mobileNavigate(sectionId, clickedEl) {
    // Update mobile nav active state
    document.querySelectorAll('.mnav-item').forEach(function (el) {
        el.classList.remove('active');
    });
    if (clickedEl) clickedEl.classList.add('active');

    // Sync sidebar nav links
    document.querySelectorAll('.nav-link').forEach(function (el) {
        el.classList.remove('active');
    });
    var sidebarLink = document.querySelector('.nav-link[data-section="' + sectionId + '"]');
    if (sidebarLink) sidebarLink.classList.add('active');

    // Show correct section
    document.querySelectorAll('.section').forEach(function (sec) {
        sec.classList.remove('active');
    });
    var target = document.getElementById('section-' + sectionId);
    if (target) {
        target.classList.add('active');
        target.scrollTop = 0;
    }

    // Lazy-load queue on first visit
    if (sectionId === 'queue' && !_queueLoaded) loadQueueFromDrive();
}

// ══════════════════════════════════════
// LIGHTBOX
// ══════════════════════════════════════
function rebuildLbItems() {
    var visible = Array.from(document.querySelectorAll('.gitem:not(.hide)'));
    lbItems = visible.map(function (el) {
        var img = el.querySelector('img');
        // Prefer the original full-quality URL stored in data-src-full;
        // fall back to the already-loaded src if already displayed.
        var src = el.getAttribute('data-src-full') ||
                  img.getAttribute('data-src') ||
                  img.src;
        return {
            src: src,
            title: el.querySelector('p') ? el.querySelector('p').textContent : '',
        };
    });
}

function openLightbox(el) {
    // Check if it's a pricing card or a portfolio item
    var isPrice = el.classList.contains('price-card');

    if (isPrice) {
        // Collect all price cards for navigation
        var cards = Array.from(document.querySelectorAll('.price-card'));
        lbItems = cards.map(function (card) {
            var img = card.querySelector('img');
            var title = card.querySelector('h3');
            return {
                src: img ? img.src : '',
                title: title ? title.textContent : 'Pricing'
            };
        });
        lbIndex = cards.indexOf(el);
    } else {
        // Portfolio logic (existing)
        rebuildLbItems();
        var visible = Array.from(document.querySelectorAll('.gitem:not(.hide)'));
        lbIndex = visible.indexOf(el);
    }

    if (lbIndex < 0) lbIndex = 0;
    renderLightbox();
    document.getElementById('lightbox').classList.add('open');
}

function renderLightbox() {
    var item = lbItems[lbIndex];
    if (!item) return;

    var img = document.getElementById('lb-img');
    img.style.opacity = '0';
    img.onload = function () { img.style.opacity = '1'; };
    img.src = item.src;

    document.getElementById('lb-title').textContent = item.title;
    document.getElementById('lb-counter').textContent = (lbIndex + 1) + ' / ' + lbItems.length;

    document.getElementById('lb-prev').disabled = lbIndex === 0;
    document.getElementById('lb-next').disabled = lbIndex === lbItems.length - 1;
}

function lbNavigate(dir) {
    var next = lbIndex + dir;
    if (next < 0 || next >= lbItems.length) return;
    lbIndex = next;
    renderLightbox();
}

function closeLightbox() {
    document.getElementById('lightbox').classList.remove('open');
}

function closeLightboxOutside(e) {
    if (e.target === document.getElementById('lightbox')) closeLightbox();
}

// ══════════════════════════════════════
// TOAST
// ══════════════════════════════════════
function showToast(msg, dur) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, dur || 3000);
}

// ══════════════════════════════════════
// KEYBOARD
// ══════════════════════════════════════
document.addEventListener('keydown', function (e) {
    // 1. Lightbox Navigation
    var lb = document.getElementById('lightbox');
    if (lb && lb.classList.contains('open')) {
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') lbNavigate(-1);
        if (e.key === 'ArrowRight') lbNavigate(1);
    }

    // 2. Protection: Disable F12, Ctrl+Shift+I/J/C, Ctrl+U
    // F12
    if (e.keyCode === 123 || e.key === 'F12') {
        e.preventDefault();
        return false;
    }
    // Ctrl + Shift + (I, J, C)
    if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C' || e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) {
        e.preventDefault();
        return false;
    }
    // Ctrl + U (View Source)
    if (e.ctrlKey && (e.key === 'U' || e.key === 'u' || e.keyCode === 85)) {
        e.preventDefault();
        return false;
    }
});

// 3. Protection: Disable Right-Click
document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
});


// ══════════════════════════════════════
// TOUCH GESTURES
// ══════════════════════════════════════

// ── 1. Lightbox Swipe (left/right to navigate images) ──
function initLightboxSwipe() {
    var lb = document.getElementById('lightbox');
    if (!lb) return;

    var startX = 0;
    var startY = 0;
    var locked = false;          // direction lock after first dominant axis

    lb.addEventListener('touchstart', function (e) {
        startX = e.changedTouches[0].clientX;
        startY = e.changedTouches[0].clientY;
        locked = false;
    }, { passive: true });

    lb.addEventListener('touchend', function (e) {
        var dx = e.changedTouches[0].clientX - startX;
        var dy = e.changedTouches[0].clientY - startY;

        // Only fire when clearly horizontal (dx dominant + above threshold)
        if (Math.abs(dx) < 50) return;
        if (Math.abs(dy) > Math.abs(dx)) return;  // vertical swipe → ignore

        lbNavigate(dx < 0 ? 1 : -1);
    }, { passive: true });
}

// ── 2. Section Swipe (swipe main area left/right to change tab) ──
var SECTION_ORDER = ['home', 'portfolio', 'pricing', 'about', 'contact', 'queue'];

function initSectionSwipe() {
    var main = document.querySelector('.main');
    if (!main) return;

    var startX = 0;
    var startY = 0;

    main.addEventListener('touchstart', function (e) {
        startX = e.changedTouches[0].clientX;
        startY = e.changedTouches[0].clientY;
    }, { passive: true });

    main.addEventListener('touchend', function (e) {
        // Ignore if swipe started from a horizontal scroll container
        var origin = e.target;
        while (origin && origin !== main) {
            if (origin.classList &&
                (origin.classList.contains('cat-bar') ||
                 origin.classList.contains('sub-cat-bar') ||
                 origin.classList.contains('pricing-grid'))) {
                return;
            }
            origin = origin.parentElement;
        }

        var dx = e.changedTouches[0].clientX - startX;
        var dy = e.changedTouches[0].clientY - startY;

        // Must be clearly horizontal and above threshold
        if (Math.abs(dx) < 65) return;
        if (Math.abs(dy) > Math.abs(dx) * 0.6) return;  // too diagonal → ignore

        // Find current active section
        var current = null;
        document.querySelectorAll('.section').forEach(function (sec) {
            if (sec.classList.contains('active')) {
                current = sec.id.replace('section-', '');
            }
        });

        var idx = SECTION_ORDER.indexOf(current);
        if (idx === -1) return;

        if (dx < 0 && idx < SECTION_ORDER.length - 1) {
            // Swipe left → next section
            goTo(SECTION_ORDER[idx + 1]);
        } else if (dx > 0 && idx > 0) {
            // Swipe right → previous section
            goTo(SECTION_ORDER[idx - 1]);
        }
    }, { passive: true });
}


// ══════════════════════════════════════
// QUEUE SYSTEM
// ══════════════════════════════════════
var _queueLoaded = false;

function loadQueueFromDrive() {
    if (typeof SCRIPT_URL === 'undefined') {
        showQueueError('⚙️ Setup needed: paste your Apps Script URL into index.html');
        return;
    }

    showQueueLoading(true);
    hideQueueError();

    fetch(SCRIPT_URL + '?type=queue')
        .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function (data) {
            showQueueLoading(false);
            if (!data.success) throw new Error(data.error || 'Script error');
            _queueLoaded = true;
            renderQueue(data.queue);
        })
        .catch(function (err) {
            showQueueLoading(false);
            showQueueError('ไม่สามารถโหลดคิวได้: ' + err.message);
        });
}



function renderQueue(queue) {
    var content   = document.getElementById('queue-content');
    var tbody     = document.getElementById('queue-tbody');
    var emptyEl   = document.getElementById('queue-empty');
    var countEl   = document.getElementById('queue-count');
    var updatedEl = document.getElementById('queue-updated');
    if (!content || !tbody) return;

    content.classList.remove('hide');
    tbody.innerHTML = '';

    var now = new Date();
    var timeStr = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0') + ' น.';
    if (updatedEl) updatedEl.textContent = 'อัพเดตล่าสุด ' + timeStr;

    if (!queue || queue.length === 0) {
        if (emptyEl) emptyEl.classList.remove('hide');
        if (countEl) countEl.textContent = 'ไม่มีคิวงานตอนนี้';
        return;
    }
    if (emptyEl) emptyEl.classList.add('hide');

    var waiting = queue.filter(function(q) { return q.status !== 'เสร็จแล้ว'; }).length;
    if (countEl) countEl.textContent = 'คิวทั้งหมด ' + queue.length + ' งาน' +
        (waiting < queue.length ? ' (รออยู่ ' + waiting + ' งาน)' : '');

    var statusCfg = {
        'รอคิว'     : { cls: 'sq-wait',  label: '⏳ รอคิว' },
        'กำลังทำ'   : { cls: 'sq-doing', label: '✨ กำลังทำ' },
        'ส่งแล้ว'    : { cls: 'sq-done',  label: '✓ ส่งแล้ว' }
    };

    queue.forEach(function (item) {
        var st  = statusCfg[item.status] || { cls: 'sq-wait', label: item.status || 'รอคิว' };
        var tr  = document.createElement('tr');
        if (item.status === 'ส่งแล้ว') tr.classList.add('row-done');
        if (item.status === 'กำลังทำ') tr.classList.add('row-doing');

        tr.innerHTML =
            '<td><span class="q-num">' + escHtml('' + item.number) + '</span></td>' +
            '<td class="q-name">'  + escHtml(item.name)  + '</td>' +
            '<td class="q-type">'  + escHtml(item.type)  + '</td>' +
            '<td><span class="q-badge ' + st.cls + '">' + st.label + '</span></td>' +
            '<td class="q-note">'  + escHtml(item.note)  + '</td>';

        tbody.appendChild(tr);
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function escHtml(s) {
    if (!s) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function showQueueLoading(show) {
    var el = document.getElementById('queue-loading');
    if (el) el.style.display = show ? 'flex' : 'none';
}
function showQueueError(msg) {
    var el  = document.getElementById('queue-error');
    var txt = document.getElementById('queue-error-msg');
    if (!el) return;
    if (txt) txt.textContent = msg;
    el.classList.remove('hide');
    el.style.display = 'flex';
}
function hideQueueError() {
    var el = document.getElementById('queue-error');
    if (!el) return;
    el.classList.add('hide');
    el.style.display = 'none';
}

// ══════════════════════════════════════
// BACK TO TOP
// ══════════════════════════════════════

/** Smooth scroll back to top of main content area */
function scrollToTop() {
    var main = document.querySelector('.main');
    if (main) {
        main.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// Show/hide Back to Top button based on scroll position
(function () {
    function initBackToTop() {
        var btn  = document.getElementById('back-to-top');
        var main = document.querySelector('.main');
        if (!btn || !main) return;

        main.addEventListener('scroll', function () {
            if (main.scrollTop > 300) {
                btn.classList.add('show');
            } else {
                btn.classList.remove('show');
            }
        });
    }
    document.addEventListener('DOMContentLoaded', initBackToTop);
})();

// ══════════════════════════════════════
// INIT
// ══════════════════════════════════════

document.addEventListener('DOMContentLoaded', function () {
    var app = document.getElementById('app');
    app.style.display = 'none';

    // Initialize Lucide Icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Set up Intersection Observer for lazy loading
    initLazyObserver();

    // Set up touch gestures
    initLightboxSwipe();
    initSectionSwipe();

    // Load gallery images from Google Drive
    loadGalleryFromDrive();
});


