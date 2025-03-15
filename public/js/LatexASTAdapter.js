// AST to Legacy Format Adapter
export class LatexASTAdapter {
    constructor(ast) {
        this.ast = ast;
    }

    // Convert AST to legacy format
    toLegacyFormat() {
        if (!this.ast) return '';
        return this._processNode(this.ast);
    }

    // Process individual AST nodes
    _processNode(node) {
        if (typeof node === 'string') {
            return node;
        }

        if (Array.isArray(node)) {
            return node.map(this._processNode.bind(this)).join('');
        }

        switch (node.type) {
            case 'document':
                return this._processNode(node.content);
            
            case 'text':
                return node.content;
            
            case 'command':
                return this._processCommand(node);
            
            case 'environment':
                return this._processEnvironment(node);
            
            default:
                return '';
        }
    }

    // Process LaTeX commands
    _processCommand(node) {
        switch (node.name) {
            case 'section':
            case 'section*':
                return `\\${node.name}{${this._processNode(node.args[0])}}\n`;
            
            case 'textbf':
            case 'textit':
            case 'emph':
                return `\\${node.name}{${this._processNode(node.args[0])}}`;
            
            case 'item':
                return `\\item ${this._processNode(node.args[0])}\n`;
            
            case 'itemize':
            case 'enumerate':
                return `\\begin{${node.name}}\n${this._processNode(node.content)}\\end{${node.name}}\n`;
            
            default:
                return `\\${node.name}${node.args ? node.args.map(arg => `{${this._processNode(arg)}}`).join('') : ''}`;
        }
    }

    // Process LaTeX environments
    _processEnvironment(node) {
        return `\\begin{${node.name}}\n${this._processNode(node.content)}\\end{${node.name}}\n`;
    }
}