// Initialize any template libraries first
document.addEventListener('DOMContentLoaded', function() {
    // Fix for template initialization
    // Check if the template library is available and initialize properly
    if (window.Template || (window.n && n.Template)) {
        try {
            // Ensure Template is accessed correctly depending on how it's defined
            const TemplateClass = window.Template || (window.n && n.Template);
            
            // If it's a function but not a constructor, wrap it properly
            if (typeof TemplateClass === 'function' && !/^\s*class\s+/.test(TemplateClass.toString())) {
                // Create proper constructor wrapper if needed
                window.Template = function(args) {
                    return TemplateClass(args);
                };
            }
        } catch (e) {
            console.error('Template initialization error:', e);
        }
    }
    
    // Fix for collapsible buttons
    const initCollapsibles = function() {
        const collapsibleButtons = document.querySelectorAll('.collapsible-button');
        
        collapsibleButtons.forEach(button => {
            // Remove any existing listeners to prevent duplicates
            button.removeEventListener('click', toggleCollapsible);
            // Add fresh event listener
            button.addEventListener('click', toggleCollapsible);
        });
    };
    
    function toggleCollapsible() {
        const content = this.nextElementSibling;
        
        // Toggle active class on button
        this.classList.toggle('active');
        
        // Toggle display of content
        if (content.style.maxHeight) {
            content.style.maxHeight = null;
        } else {
            content.style.maxHeight = content.scrollHeight + "px";
        }
    }
    
    // Initialize collapsibles on page load
    initCollapsibles();
    
    // Re-initialize after any dynamic content loads or AJAX updates
    // This handles cases where collapsible elements are added dynamically
    const observeDOM = (function(){
        const MutationObserver = window.MutationObserver || window.WebKitMutationObserver;
        
        return function(obj, callback){
            if (!obj || obj.nodeType !== 1) return;
            
            if (MutationObserver) {
                const mutationObserver = new MutationObserver(callback);
                mutationObserver.observe(obj, { childList: true, subtree: true });
                return mutationObserver;
            } else {
                obj.addEventListener('DOMNodeInserted', callback, false);
                obj.addEventListener('DOMNodeRemoved', callback, false);
            }
        };
    })();
    
    // Watch for DOM changes and reinitialize collapsibles when needed
    observeDOM(document.body, function() {
        initCollapsibles();
    });
});
