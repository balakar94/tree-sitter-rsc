# tree-sitter-rsc

Tree-sitter grammar for the **MikroTik RouterOS Script** language (RouterOS v7).

`.rsc` is the plain-text script format RouterOS uses natively: `/export` on any device writes the configuration as a `.rsc` file full of RouterOS commands, and `/import` replays it later. This grammar parses exactly that syntax — hand-written automation scripts and full device exports alike.

Powers the [MikroTik RouterOS Script extension for Zed](https://github.com/balakar94/mikrotik-zed) and any tree-sitter-based tooling (Neovim, Helix, GitHub code navigation, etc.).

<p align="center">
  <a href="https://github.com/balakar94/tree-sitter-rsc/actions/workflows/ci.yml"><img src="https://github.com/balakar94/tree-sitter-rsc/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://tree-sitter.github.io/tree-sitter"><img src="https://img.shields.io/badge/tree--sitter-0.26-orange" alt="tree-sitter"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="license"></a>
</p>

## Language coverage

The grammar parses the RouterOS scripting surface used by `.rsc` files:

- Menu paths — `/interface/bridge/port`, `/ip/firewall/filter`, …
- Commands and property assignment — `add`, `set`, `enable`, `key=value`
- Command invocation — `[len $arr]`, `[find name="wan"]`
- Script blocks — `{ ... }` with control flow (`:if`, `:foreach`, `:while`, `:do`)
- Variables and scoping — `$var`, `:global`, `:local` (interpolation like `"text $var"` stays inside the string token)
- Arrays and string interpolation — `{"a"; "b"}`, `"text $var"`
- Subexpressions — `(1 + 2)`, `($a = 1)`
- Comments — `# comment`
- Line continuation — trailing `\` joins the next physical line (RouterOS semantics)
- Menu continuation across indented lines

## Requirements

| Tool | Version | Purpose |
|------|---------|---------|
| Generated parser ABI | `TREE_SITTER_LANGUAGE_VERSION 15` | `src/parser.c` |
| `tree-sitter-cli` | `^0.26` (dev) | `npx tree-sitter generate` / `test` |
| `tree-sitter` runtime (Node) | `^0.25` | ABI 15 runtime for `bindings/node` |
| `tree-sitter` crate (Rust) | `0.25` | ABI 15 runtime for Rust consumers — older crates reject this parser |
| Node.js | `20+` (LTS) | Native binding (`binding.gyp` with `NAPI_DISABLE_CPP_EXCEPTIONS`) |
| Rust | `1.85+` (edition 2024) | Optional `tree-sitter` crate consumers (`build.rs`, `bindings/rust/`) |

## Development

```bash
npm install                # tree-sitter-cli + tree-sitter
npx tree-sitter generate   # grammar.js → src/parser.c (never edit src/ by hand)
npx tree-sitter test       # corpus tests must pass clean
npx tree-sitter parse test/example.rsc   # fixtures must parse without ERROR/MISSING
npx tree-sitter highlight test/example.rsc

cargo test                 # optional: Rust binding (build.rs + bindings/rust)
```

Or via the parent repo:

```bash
make generate              # from mikrotik-zed root: regen + check
make test-grammar
make highlight FILE=grammars/rsc/test/example.rsc
```

### Repository layout

```
grammar.js              # Source of truth — edit here
src/                    # Generated (parser.c, grammar.json, node-types.json) — do not hand-edit
queries/highlights.scm  # Deduped copy of mikrotik-zed/languages/rsc/highlights.scm
queries/injections.scm  # Intentionally empty (RSC has no embedded languages)
test/corpus/            # Corpus tests (one file per construct)
bindings/node/          # Node native binding (binding.cc + index.js + index.d.ts)
bindings/rust/lib.rs    # Rust crate entry (language(), NODE_TYPES)
binding.gyp             # Node build (NAPI_DISABLE_CPP_EXCEPTIONS for Node 20+)
build.rs                # Rust build (compiles src/parser.c via cc)
package.json            # npm metadata (tree-sitter section included)
tree-sitter.json        # tree-sitter metadata (scope source.rsc, file-types ["rsc"])
Cargo.toml              # Rust crate for tree-sitter Rust consumers
.github/workflows/      # CI: generate freshness + corpus + fixture parses
```

### Highlighting

`queries/highlights.scm` is a deduped copy of the canonical query at `mikrotik-zed/languages/rsc/highlights.scm`. After changing highlighting in the parent repo, mirror it here so `tree-sitter test` / `tree-sitter highlight` agree with Zed. `queries/injections.scm` is intentionally empty (RSC has no embedded languages).

### Publishing

This repo is a standalone public repo so Zed can fetch it as a grammar submodule without auth. Rev is pinned in `mikrotik-zed/extension.toml`:

```toml
[grammars.rsc]
repository = "https://github.com/balakar94/tree-sitter-rsc"
rev = "<current HEAD SHA>"   # git -C grammars/rsc rev-parse HEAD
```

Update via the parent repo:

```bash
python scripts/publish_grammar.py --dry-run
python scripts/publish_grammar.py --push   # pushes + bumps extension.toml rev
```

## Consumers

- [`mikrotik-zed`](https://github.com/balakar94/mikrotik-zed) — Zed extension (highlighting, brackets, outline, indentation) + companion `rsc-ls` language server (completion, hover, diagnostics). Grammar is vendored as `grammars/rsc` submodule.
- Node: `npm install github:balakar94/tree-sitter-rsc`
- Rust: `cargo add --git https://github.com/balakar94/tree-sitter-rsc`

(Published `tree-sitter-rsc` packages on npm/crates.io are planned but not yet cut — use the Git sources above for now.)

## License

[Apache-2.0](LICENSE)
