// ════════════════════════════════════════════
// Gallery Data Web Worker
// ════════════════════════════════════════════
// This worker runs in background thread, keeping the main thread free for UI updates

self.SCRIPT_URL = null;

self.addEventListener('message', function(event) {
    var msg = event.data;
    
    if (msg.type === 'set-url') {
        self.SCRIPT_URL = msg.url;
        return;
    }
    
    if (msg.type === 'fetch-gallery') {
        fetchGalleryData();
        return;
    }
});

function fetchGalleryData() {
    if (!self.SCRIPT_URL) {
        self.postMessage({
            type: 'error',
            error: 'Script URL not set'
        });
        return;
    }
    
    // Abort after 20 seconds max
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 20000);
    
    fetch(self.SCRIPT_URL, {
        signal: controller.signal,
        method: 'GET'
    })
    .then(function(r) {
        clearTimeout(timeout);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    })
    .then(function(data) {
        if (!data.success) throw new Error(data.error || 'Script error');
        
        // Send back parsed data
        self.postMessage({
            type: 'success',
            categories: data.categories,
            timestamp: Date.now()
        });
    })
    .catch(function(err) {
        clearTimeout(timeout);
        self.postMessage({
            type: 'error',
            error: err.message || 'Network error'
        });
    });
}
