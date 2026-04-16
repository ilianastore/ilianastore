'use strict';

// ══════════════════════════════════════
// WEB WORKER for Gallery Loading (non-blocking)
// ──────────────────────────────────────
var _galleryWorker = null;

function initGalleryWorker() {
    if (typeof Worker === 'undefined') return;
    try {
        _galleryWorker = new Worker('gallery-worker.js');
        _galleryWorker.addEventListener('message', function(event) {
            handleWorkerMessage(event.data);
        });
        if (typeof SCRIPT_URL !== 'undefined') {
            _galleryWorker.postMessage({
                type: 'set-url',
                url: SCRIPT_URL
            });
        }
    } catch (e) {
        console.warn('Web Worker not available, using main thread');
    }
}

function handleWorkerMessage(msg) {
    if (msg.type === 'success') {
        showGalleryLoading(false, 'portfolio');
        saveGalleryCache(msg.categories, 'portfolio');
        applyGalleryData(msg.categories, 'portfolio');
    } else if (msg.type === 'error') {
        showGalleryLoading(false, 'portfolio');
        if (Object.keys(driveData).length === 0) {
            showGalleryError('Could not load gallery: ' + msg.error, 'portfolio');
        }
    }
}

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
        rootMargin: '500px 0px',
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
    img.classList.add('img-loading');
    img.src = src;
    img.removeAttribute('data-src');
    img.onload = function () {
        img.classList.remove('img-loading');
        img.classList.add('img-loaded');
        if (img.parentElement) img.parentElement.classList.add('loaded');
    };
    img.onerror = function () {
        if (fallback) img.src = fallback;
        img.classList.remove('img-loading');
        if (img.parentElement) img.parentElement.classList.add('loaded');
        img.onerror = null;
    };
}

// ══════════════════════════════════════
// GOOGLE DRIVE GALLERY LOADING
// ══════════════════════════════════════

var driveData = {};
var driveDataSignStock = {};

var GALLERY_CACHE_KEY = 'june_gallery_cache';
var GALLERY_CACHE_TTL = 120 * 60 * 1000; 

var EAGER_LOAD_COUNT = 16; 

function saveGalleryCache(categories, type) {
    try {
        var key = (type === 'signstock' ? 'signstock_gallery_cache' : GALLERY_CACHE_KEY);
        localStorage.setItem(key, JSON.stringify({
            ts: Date.now(),
            categories: categories
        }));
    } catch (e) { }
}

function loadGalleryCache(type) {
    try {
        var key = (type === 'signstock' ? 'signstock_gallery_cache' : GALLERY_CACHE_KEY);
        var raw = localStorage.getItem(key);
        if (!raw) return null;
        var obj = JSON.parse(raw);
        if (!obj || !obj.categories) return null;
        return obj;
    } catch (e) { return null; }
}

function applyGalleryData(categories, type) {
    if (type === 'signstock') {
        driveDataSignStock = categories;
        renderMainFilterButtons('cat-bar-signstock', driveDataSignStock, 'signstock');
        renderAllGalleryItems('gallery-signstock', driveDataSignStock, 'signstock');
    } else {
        driveData = categories;
        renderMainFilterButtons('cat-bar', driveData, 'portfolio');
        renderAllGalleryItems('gallery', driveData, 'portfolio');
    }
    updateHomeStats();
}

function fetchGalleryFromNetwork(showLoader, type) {
    if (showLoader) showGalleryLoading(true, type);
    hideGalleryError(type);

    var timeout = setTimeout(function() {
        var loading = document.getElementById('gallery-loading' + (type === 'portfolio' ? '' : '-' + type));
        if (loading && loading.style.display !== 'none') {
            showGalleryLoading(false, type);
            var data = (type === 'signstock' ? driveDataSignStock : driveData);
            if (Object.keys(data).length === 0) {
                showGalleryError('Network timeout — please check your connection', type);
            }
        }
    }, 20000);

    var url = SCRIPT_URL + (SCRIPT_URL.indexOf('?') > -1 ? '&' : '?') + 'type=' + type;

    fetch(url)
        .then(function (r) {
            clearTimeout(timeout);
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function (data) {
            showGalleryLoading(false, type);
            if (!data.success) throw new Error(data.error || 'Script error');
            var categories = data.categories;
            saveGalleryCache(categories, type);
            applyGalleryData(categories, type);
        })
        .catch(function (err) {
            clearTimeout(timeout);
            showGalleryLoading(false, type);
            var d = (type === 'signstock' ? driveDataSignStock : driveData);
            if (Object.keys(d).length === 0) {
                showGalleryError('Could not load gallery: ' + err.message, type);
            }
        });
}

function loadGalleryFromDrive(showLoader, type) {
    type = type || 'portfolio';
    if (typeof SCRIPT_URL === 'undefined' || SCRIPT_URL === 'YOUR_APPS_SCRIPT_URL_HERE') {
        showGalleryError('⚙️ Setup needed', type);
        return;
    }

    var cached = loadGalleryCache(type);
    var cacheAge = cached ? (Date.now() - cached.ts) : Infinity;

    if (cached && cacheAge < GALLERY_CACHE_TTL) {
        applyGalleryData(cached.categories, type);
        setTimeout(function() { fetchGalleryFromNetwork(false, type); }, 2000);
    } else if (cached) {
        applyGalleryData(cached.categories, type);
        fetchGalleryFromNetwork(false, type);
    } else {
        fetchGalleryFromNetwork(showLoader !== false, type);
    }
}

function renderMainFilterButtons(barId, sourceData, type) {
    var bar = document.getElementById(barId);
    if (!bar) return;
    bar.innerHTML = '';

    var allBtn = document.createElement('button');
    allBtn.className = 'cat active';
    allBtn.setAttribute('data-filter', 'all');
    allBtn.innerHTML = 'All <i data-lucide="layers" class="cat-icon"></i>';
    allBtn.onclick = function () { onMainCatClick('all', allBtn, type); };
    bar.appendChild(allBtn);

    Object.keys(sourceData).forEach(function (catName) {
        var btn = document.createElement('button');
        btn.className = 'cat';
        btn.setAttribute('data-filter', catName);
        btn.innerHTML = '<i data-lucide="image" class="cat-icon"></i> ' + catName;
        btn.onclick = function () { onMainCatClick(catName, btn, type); };
        bar.appendChild(btn);
    });

    var existingSub = document.getElementById('dynamic-sub-bar-' + type);
    if (existingSub) existingSub.remove();

    var subBar = document.createElement('div');
    subBar.id = 'dynamic-sub-bar-' + type;
    subBar.className = 'sub-cat-bar';
    bar.insertAdjacentElement('afterend', subBar);

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function onMainCatClick(catName, clickedBtn, type) {
    var container = clickedBtn.parentElement;
    container.querySelectorAll('.cat').forEach(function (b) { b.classList.remove('active'); });
    clickedBtn.classList.add('active');

    var subBar = document.getElementById('dynamic-sub-bar-' + type);
    if (!subBar) return;
    subBar.innerHTML = '';
    subBar.classList.remove('active');

    if (catName === 'all') {
        filterBySubCat(null, null, type);
        return;
    }

    var data = (type === 'signstock' ? driveDataSignStock : driveData);
    var entry = data[catName];
    var subs = entry ? Object.keys(entry._subs || {}) : [];

    if (subs.length > 0) {
        subs.forEach(function (subName) {
            var btn = document.createElement('button');
            btn.className = 'sub-cat';
            btn.innerHTML = subName + ' <i data-lucide="heart" class="btn-inline-icon"></i>';
            btn.onclick = function () {
                subBar.querySelectorAll('.sub-cat').forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
                filterBySubCat(catName, subName, type);
            };
            subBar.appendChild(btn);
        });
        subBar.classList.add('active');
        if (typeof lucide !== 'undefined') lucide.createIcons();
        filterBySubCat(catName, null, type);
    } else {
        filterBySubCat(catName, null, type);
    }
}

function filterBySubCat(parent, sub, type) {
    var galleryId = (type === 'signstock' ? 'gallery-signstock' : 'gallery');
    var gallery = document.getElementById(galleryId);
    if (!gallery) return;

    var items = gallery.querySelectorAll('.gitem');
    var visible = 0;
    items.forEach(function (item) {
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
            var delay = visible * 0.03;
            visible++;
            item.classList.remove('hide');
            item.style.opacity = '0';
            item.style.transform = 'scale(0.95)';
            item.style.transition = 'opacity .3s ease ' + delay + 's, transform .3s ease ' + delay + 's';
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    item.style.opacity = '1';
                    item.style.transform = 'scale(1)';
                });
            });
        } else {
            item.style.opacity = '0';
            item.style.transform = 'scale(0.95)';
            setTimeout(function () { item.classList.add('hide'); }, 200);
        }
    });

    var emptyId = (type === 'signstock' ? 'gallery-empty-signstock' : 'gallery-empty');
    var emptyMsg = document.getElementById(emptyId);
    if (emptyMsg) {
        emptyMsg.style.display = visible === 0 ? 'flex' : 'none';
        if (visible === 0) emptyMsg.classList.remove('hide');
    }

    rebuildLbItems();
}

function renderAllGalleryItems(galleryId, sourceData, type) {
    var gallery = document.getElementById(galleryId);
    if (!gallery) return;
    gallery.querySelectorAll('.gitem').forEach(function (el) { el.remove(); });

    var eagerCount = 0;
    var totalCount = 0;
    var fragment = document.createDocumentFragment();

    Object.keys(sourceData).forEach(function (catName) {
        var entry = sourceData[catName];
        (entry._images || []).forEach(function (item) {
            totalCount++;
            fragment.appendChild(makeGitem(item, catName, catName, eagerCount < EAGER_LOAD_COUNT));
            eagerCount++;
        });
        Object.keys(entry._subs || {}).forEach(function (subName) {
            entry._subs[subName].forEach(function (item) {
                totalCount++;
                fragment.appendChild(makeGitem(item, catName, subName, eagerCount < EAGER_LOAD_COUNT));
                eagerCount++;
            });
        });
    });

    gallery.appendChild(fragment);

    var emptyId = (type === 'signstock' ? 'gallery-empty-signstock' : 'gallery-empty');
    var empty = document.getElementById(emptyId);
    if (empty) {
        empty.style.display = totalCount === 0 ? 'flex' : 'none';
        totalCount === 0 ? empty.classList.remove('hide') : empty.classList.add('hide');
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
    rebuildLbItems();
}

function makeGitem(item, parent, sub, isEager) {
    var div = document.createElement('div');
    div.className = 'gitem';
    div.setAttribute('data-parent', parent);
    div.setAttribute('data-sub', sub);
    div.setAttribute('data-file-id', item.id);
    div.setAttribute('data-src-full', item.url);
    div.onclick = function () { openLightbox(div); };

    var img = document.createElement('img');
    var thumbUrl = 'https://drive.google.com/thumbnail?id=' + item.id + '&sz=w400';
    img.alt = sub;
    img.classList.add('img-loading');

    if (isEager) {
        img.src = thumbUrl;
        img.onload = function () {
            img.classList.remove('img-loading');
            img.classList.add('img-loaded');
            div.classList.add('loaded');
        };
    } else {
        img.setAttribute('data-src', thumbUrl);
        img.setAttribute('data-fallback', thumbUrl);
        img.src = '';
        img.classList.add('lazy');
        observeImg(img);
    }

    var hover = document.createElement('div');
    hover.className = 'ghover';
    hover.innerHTML = '<span><i data-lucide="maximize-2"></i></span><p>' + sub + '</p>';

    div.appendChild(img);
    div.appendChild(hover);
    return div;
}

function showGalleryLoading(show, type) {
    var loadingId = (type === 'signstock' ? 'gallery-loading-signstock' : 'gallery-loading');
    var galleryId = (type === 'signstock' ? 'gallery-signstock' : 'gallery');
    var el      = document.getElementById(loadingId);
    var gallery = document.getElementById(galleryId);

    if (show) {
        if (el) el.style.display = 'flex';
        if (gallery && !gallery.querySelector('.gitem-placeholder')) {
            var frag = document.createDocumentFragment();
            for (var i = 0; i < 8; i++) {
                var ph = document.createElement('div');
                ph.className = 'gitem gitem-placeholder';
                frag.appendChild(ph);
            }
            gallery.insertBefore(frag, gallery.firstChild);
        }
    } else {
        if (el) el.style.display = 'none';
        if (gallery) {
            gallery.querySelectorAll('.gitem-placeholder').forEach(function (p) { p.remove(); });
        }
    }
}

function showGalleryError(msg, type) {
    var errId = (type === 'signstock' ? 'gallery-error-signstock' : 'gallery-error');
    var msgId = (type === 'signstock' ? 'gallery-error-msg-signstock' : 'gallery-error-msg');
    var el = document.getElementById(errId);
    var txt = document.getElementById(msgId);
    if (!el) return;
    if (txt) txt.textContent = msg;
    el.classList.remove('hide');
    el.style.display = 'flex';
}

function hideGalleryError(type) {
    var errId = (type === 'signstock' ? 'gallery-error-signstock' : 'gallery-error');
    var el = document.getElementById(errId);
    if (!el) return;
    el.classList.add('hide');
    el.style.display = 'none';
}

function updateHomeStats() {
    var artworksCount = 0;
    var catsCount = 0;

    function countSource(data) {
        Object.keys(data).forEach(function (catName) {
            catsCount++;
            var entry = data[catName];
            if (entry._images) artworksCount += entry._images.length;
            if (entry._subs) {
                Object.keys(entry._subs).forEach(function (sub) {
                    artworksCount += entry._subs[sub].length;
                });
            }
        });
    }

    countSource(driveData);
    countSource(driveDataSignStock);

    var artEl = document.getElementById('count-artworks');
    var catEl = document.getElementById('count-categories');

    if (artEl) artEl.textContent = artworksCount + (artworksCount >= 100 ? '+' : '');
    if (catEl) catEl.textContent = catsCount;
}

// ══════════════════════════════════════
// WELCOME SCREEN
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
    document.querySelectorAll('.nav-link').forEach(function (el) { el.classList.remove('active'); });
    if (clickedEl) clickedEl.classList.add('active');

    document.querySelectorAll('.mnav-item').forEach(function (el) { el.classList.remove('active'); });
    var mnavActive = document.querySelector('.mnav-item[data-section="' + sectionId + '"]');
    if (mnavActive) mnavActive.classList.add('active');

    document.querySelectorAll('.section').forEach(function (sec) { sec.classList.remove('active'); });
    var target = document.getElementById('section-' + sectionId);
    if (target) {
        target.classList.add('active');
        target.scrollTop = 0;
    }
    if (sectionId === 'queue' && !_queueLoaded) loadQueueFromDrive();
}

function mobileNavigate(sectionId, clickedEl) {
    document.querySelectorAll('.mnav-item').forEach(function (el) { el.classList.remove('active'); });
    if (clickedEl) clickedEl.classList.add('active');

    document.querySelectorAll('.nav-link').forEach(function (el) { el.classList.remove('active'); });
    var sidebarLink = document.querySelector('.nav-link[data-section="' + sectionId + '"]');
    if (sidebarLink) sidebarLink.classList.add('active');

    document.querySelectorAll('.section').forEach(function (sec) { sec.classList.remove('active'); });
    var target = document.getElementById('section-' + sectionId);
    if (target) {
        target.classList.add('active');
        target.scrollTop = 0;
    }
    if (sectionId === 'queue' && !_queueLoaded) loadQueueFromDrive();
}

// ══════════════════════════════════════
// LIGHTBOX
// ══════════════════════════════════════
function rebuildLbItems() {
    var visible = Array.from(document.querySelectorAll('.gitem:not(.hide)'));
    lbItems = visible.map(function (el) {
        var img = el.querySelector('img');
        var src = el.getAttribute('data-src-full') || img.getAttribute('data-src') || img.src;
        return {
            src: src,
            title: el.querySelector('p') ? el.querySelector('p').textContent : '',
        };
    });
}

function openLightbox(el) {
    var isPrice = el.classList.contains('price-card');
    if (isPrice) {
        var cards = Array.from(document.querySelectorAll('.price-card'));
        lbItems = cards.map(function (card) {
            var img = card.querySelector('img');
            var title = card.querySelector('h3');
            return { src: img ? img.src : '', title: title ? title.textContent : 'Pricing' };
        });
        lbIndex = cards.indexOf(el);
    } else {
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
    var lb  = document.getElementById('lightbox');
    var img = document.getElementById('lb-img');
    lb.classList.add('is-loading');
    img.style.opacity = '0';
    img.onload = function () { lb.classList.remove('is-loading'); img.style.opacity = '1'; };
    img.onerror = function () { lb.classList.remove('is-loading'); img.style.opacity = '1'; };
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

function closeLightbox() { document.getElementById('lightbox').classList.remove('open'); }
function closeLightboxOutside(e) { if (e.target === document.getElementById('lightbox')) closeLightbox(); }

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
// KEYBOARD PROTECTION
// ══════════════════════════════════════
document.addEventListener('keydown', function (e) {
    var lb = document.getElementById('lightbox');
    if (lb && lb.classList.contains('open')) {
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') lbNavigate(-1);
        if (e.key === 'ArrowRight') lbNavigate(1);
    }
    if (e.keyCode === 123 || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) || (e.ctrlKey && e.key === 'u')) {
        e.preventDefault();
        return false;
    }
});
document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

// ══════════════════════════════════════
// SWIPE GESTURES
// ══════════════════════════════════════
function initLightboxSwipe() {
    var lb = document.getElementById('lightbox');
    if (!lb) return;
    var startX = 0;
    var startY = 0;
    lb.addEventListener('touchstart', function (e) { startX = e.changedTouches[0].clientX; startY = e.changedTouches[0].clientY; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
        var dx = e.changedTouches[0].clientX - startX;
        var dy = e.changedTouches[0].clientY - startY;
        if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
        lbNavigate(dx < 0 ? 1 : -1);
    }, { passive: true });
}

var SECTION_ORDER = ['home', 'portfolio', 'signstock', 'pricing', 'about', 'contact', 'queue'];
function initSectionSwipe() {
    var main = document.querySelector('.main');
    if (!main) return;
    var startX = 0;
    var startY = 0;
    main.addEventListener('touchstart', function (e) { startX = e.changedTouches[0].clientX; startY = e.changedTouches[0].clientY; }, { passive: true });
    main.addEventListener('touchend', function (e) {
        var origin = e.target;
        while (origin && origin !== main) {
            if (origin.classList && (origin.classList.contains('cat-bar') || origin.classList.contains('sub-cat-bar') || origin.classList.contains('pricing-grid'))) return;
            origin = origin.parentElement;
        }
        var dx = e.changedTouches[0].clientX - startX;
        var dy = e.changedTouches[0].clientY - startY;
        if (Math.abs(dx) < 65 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
        var current = null;
        document.querySelectorAll('.section').forEach(function (sec) { if (sec.classList.contains('active')) current = sec.id.replace('section-', ''); });
        var idx = SECTION_ORDER.indexOf(current);
        if (idx === -1) return;
        if (dx < 0 && idx < SECTION_ORDER.length - 1) goTo(SECTION_ORDER[idx + 1]);
        else if (dx > 0 && idx > 0) goTo(SECTION_ORDER[idx - 1]);
    }, { passive: true });
}

// ══════════════════════════════════════
// QUEUE SYSTEM
// ══════════════════════════════════════
var _queueLoaded = false;
function loadQueueFromDrive() {
    if (typeof SCRIPT_URL === 'undefined') return;
    showQueueLoading(true);
    hideQueueError();
    fetch(SCRIPT_URL + '?type=queue').then(function (r) { return r.json(); }).then(function (data) {
        showQueueLoading(false);
        if (!data.success) throw new Error(data.error || 'Script error');
        _queueLoaded = true;
        renderQueue(data.queue);
    }).catch(function (err) { showQueueLoading(false); showQueueError('ไม่สามารถโหลดคิวได้: ' + err.message); });
}

function renderQueue(queue) {
    var content = document.getElementById('queue-content');
    var tbody = document.getElementById('queue-tbody');
    var emptyEl = document.getElementById('queue-empty');
    var countEl = document.getElementById('queue-count');
    var updatedEl = document.getElementById('queue-updated');
    if (!content || !tbody) return;
    content.classList.remove('hide');
    tbody.innerHTML = '';
    var now = new Date();
    if (updatedEl) updatedEl.textContent = 'อัพเดตล่าสุด ' + now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0') + ' น.';
    if (!queue || queue.length === 0) {
        if (emptyEl) emptyEl.classList.remove('hide');
        if (countEl) countEl.textContent = 'ไม่มีคิวงานตอนนี้';
        return;
    }
    if (emptyEl) emptyEl.classList.add('hide');
    var waiting = queue.filter(function (q) { return q.status !== 'เสร็จแล้ว'; }).length;
    if (countEl) countEl.textContent = 'คิวทั้งหมด ' + queue.length + ' งาน' + (waiting < queue.length ? ' (รออยู่ ' + waiting + ' งาน)' : '');
    var statusCfg = { 'รอคิว': { cls: 'sq-wait', label: '⏳ รอคิว' }, 'กำลังทำ': { cls: 'sq-doing', label: '✨ กำลังทำ' }, 'ส่งแล้ว': { cls: 'sq-done', label: '✓ ส่งแล้ว' } };
    queue.forEach(function (item) {
        var st = statusCfg[item.status] || { cls: 'sq-wait', label: item.status || 'รอคิว' };
        var tr = document.createElement('tr');
        if (item.status === 'ส่งแล้ว') tr.classList.add('row-done');
        if (item.status === 'กำลังทำ') tr.classList.add('row-doing');
        tr.innerHTML = '<td><span class="q-num">' + escHtml('' + item.number) + '</span></td><td class="q-name">' + escHtml(item.name) + '</td><td class="q-type">' + escHtml(item.type) + '</td><td><span class="q-badge ' + st.cls + '">' + st.label + '</span></td><td class="q-note">' + escHtml(item.note) + '</td>';
        tbody.appendChild(tr);
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function escHtml(s) { if (!s) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function showQueueLoading(show) { var el = document.getElementById('queue-loading'); if (el) el.style.display = show ? 'flex' : 'none'; }
function showQueueError(msg) { var el = document.getElementById('queue-error'); var txt = document.getElementById('queue-error-msg'); if (el) { if (txt) txt.textContent = msg; el.classList.remove('hide'); el.style.display = 'flex'; } }
function hideQueueError() { var el = document.getElementById('queue-error'); if (el) { el.classList.add('hide'); el.style.display = 'none'; } }

// ══════════════════════════════════════
// SCROLL TO TOP
// ══════════════════════════════════════
function scrollToTop() {
    var main = document.querySelector('.main');
    if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
}
(function () {
    function initBackToTop() {
        var btn = document.getElementById('back-to-top');
        var main = document.querySelector('.main');
        if (!btn || !main) return;
        main.addEventListener('scroll', function () { if (main.scrollTop > 300) btn.classList.add('show'); else btn.classList.remove('show'); });
    }
    document.addEventListener('DOMContentLoaded', initBackToTop);
})();

// ══════════════════════════════════════
// BOOTSTRAP
// ══════════════════════════════════════
document.addEventListener('DOMContentLoaded', function () {
    if (typeof lucide !== 'undefined') lucide.createIcons();
    initGalleryWorker();
    initLazyObserver();
    loadGalleryFromDrive(true, 'portfolio');
    loadGalleryFromDrive(true, 'signstock');
    initLightboxSwipe();
    initSectionSwipe();
    updateHomeStats();
});
