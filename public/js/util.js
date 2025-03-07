/**
 * Utility functions for the Resume Tailoring App
 */

/**
 * Initialize collapsible elements
 */
export function initCollapsibles() {
    // Select all collapsible elements
    const collapsibleButtons = document.querySelectorAll('.collapsible, .collapsible-button');
    
    // Add click event listener with proper event handling
    collapsibleButtons.forEach(button => {
        // Skip buttons that already have the collapsible-initialized class to avoid duplication
        if (button.classList.contains('collapsible-initialized')) {
            return;
        }
        
        // Mark this button as initialized
        button.classList.add('collapsible-initialized');
        
        // Add click event listener
        button.addEventListener('click', function(e) {
            // Toggle active class
            this.classList.toggle('active');
            
            // Get the content element
            const content = this.nextElementSibling;
            
            // Check if this is a valid collapsible content
            if (content && (content.classList.contains('prompt-content') || content.classList.contains('collapsible-content'))) {
                if (content.style.maxHeight && content.style.maxHeight !== '0px') {
                    // Close content
                    content.style.maxHeight = '0px';
                    content.style.opacity = '0';
                    content.style.visibility = 'hidden';
                } else {
                    // Open content - fixed display property handling
                    content.style.display = 'block';
                    content.style.visibility = 'visible';
                    content.style.opacity = '1';
                    
                    // Set max-height after a small delay to ensure transition works
                    setTimeout(() => {
                        content.style.maxHeight = (content.scrollHeight + 30) + 'px'; // Add padding
                        
                        // For prompt-content, add additional styling
                        if (content.classList.contains('prompt-content')) {
                            content.style.padding = '1.5rem';
                            content.style.marginTop = '0.5rem';
                            content.style.border = '2px solid var(--border)';
                            content.style.transform = 'translateY(0)';
                        }
                    }, 10);
                }
                
                // Stop event from bubbling if it's interfering with other handlers
                e.stopPropagation();
            }
        });
        
        // Set initial state if active
        if (button.classList.contains('active')) {
            const content = button.nextElementSibling;
            if (content && (content.classList.contains('prompt-content') || content.classList.contains('collapsible-content'))) {
                // Ensure visible contents are properly displayed
                content.style.display = 'block';
                content.style.maxHeight = (content.scrollHeight + 30) + 'px';
                content.style.opacity = '1';
                content.style.visibility = 'visible';
                
                if (content.classList.contains('prompt-content')) {
                    content.style.padding = '1.5rem';
                    content.style.marginTop = '0.5rem';
                    content.style.border = '2px solid var(--border)';
                    content.style.transform = 'translateY(0)';
                }
            }
        }
    });
}

/**
 * Observe DOM changes and reinitialize components when needed
 * @param {Function} callback - Function to run when DOM changes
 */
export function observeDOMChanges(callback) {
    const observer = new MutationObserver(mutations => {
        let shouldUpdate = false;
        
        // Check if relevant changes happened
        for (const mutation of mutations) {
            // Only count childList changes or class changes on elements that aren't collapsible-initialized
            if (mutation.type === 'childList' || 
                (mutation.type === 'attributes' && 
                 mutation.attributeName === 'class' && 
                 !mutation.target.classList.contains('collapsible-initialized'))) {
                shouldUpdate = true;
                break;
            }
        }
        
        if (shouldUpdate) {
            callback();
        }
    });
    
    observer.observe(document.body, { 
        childList: true, 
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style']
    });
    
    return observer;
}
