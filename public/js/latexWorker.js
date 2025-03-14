// public/js/latexWorker.js
importScripts('https://cdn.jsdelivr.net/npm/latex.js/dist/latex.min.js');

self.onmessage = function(event) {
    try {
        const ast = latexjs.parse(event.data);
        self.postMessage({
            status: 'success',
            ast: ast
        });
    } catch (error) {
        self.postMessage({
            status: 'error',
            error: error.message
        });
    }
};