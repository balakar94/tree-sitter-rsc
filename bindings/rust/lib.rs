//! Tree-sitter grammar for the MikroTik RouterOS Script language (`.rsc`).
//!
//! Regenerate `src/parser.c` with `npx tree-sitter generate`; this crate
//! only wraps it for Rust consumers of the [`tree-sitter`] runtime.

use tree_sitter::Language;

unsafe extern "C" {
    fn tree_sitter_rsc() -> Language;
}

/// Returns the `rsc` tree-sitter [`Language`].
pub fn language() -> Language {
    unsafe { tree_sitter_rsc() }
}

/// The syntax highlighting query shipped with this grammar.
pub const HIGHLIGHT_QUERY: &str = include_str!("../../queries/highlights.scm");

/// The node types (`src/node-types.json`) generated for this grammar.
pub const NODE_TYPES: &str = include_str!("../../src/node-types.json");

#[cfg(test)]
mod tests {
    #[test]
    fn can_load_grammar_and_parse() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::language())
            .expect("failed to load rsc grammar");
        let tree = parser.parse("/ip route print\n", None).unwrap();
        assert!(!tree.root_node().has_error(), "unexpected parse errors");
    }
}
