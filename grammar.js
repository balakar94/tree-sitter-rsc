/**
 * Tree-sitter grammar for MikroTik RouterOS Script — simplified.
 *
 * Covers RouterOS v7.0+ scripting language.
 * This grammar focuses on structural parsing. Operators are captured
 * at the token level for highlighting but not structurally parsed.
 *
 * Reference: https://manual.mikrotik.com/llms-full.txt
 */

/// <reference types="tree-sitter-cli/dsl" />

module.exports = grammar({
  name: "rsc",

  extras: ($) => [
    /[ \t]+/,
    /\r/,
    $.comment,
    // Backslash-newline joins physical lines anywhere (RouterOS semantics),
    // e.g. inside subexpressions: ("a" . \
    //   "b"). Rules that reference line_continuation explicitly still
    // produce the node where expected.
    $.line_continuation,
  ],

  word: ($) => $.identifier,

  conflicts: ($) => [
    // subexpression `(...)` vs value-containing-parens ambiguity
    [$.subexpression, $._value],
    // menu_continuation vs bare _value in _statement
    [$.menu_continuation, $._statement],
    // named_param optional value causes GLR ambiguity with following _value:
    // `key=` may be parsed as `key=` + next statement or `key=value`.
    // Single-element conflict enables GLR for this rule.
    [$.named_param],
    // With `optional($._statement)` in _terminated_statement, a trailing
    // separator at end of input is ambiguous: it can close an empty
    // _terminated_statement or be consumed by source_file's final
    // optional(";"/"\\n"). Both yield identical trees (anonymous tokens),
    // so GLR merge is safe.
    [$.source_file, $._statement_separator],
    // Same ambiguity inside blocks, whose body mirrors source_file.
    [$.block, $._statement_separator],
    // Same ambiguity inside command_substitution, whose body also mirrors source_file.
    [$.command_substitution, $._statement_separator],
    // `:do {...}` binds a block; `{...}` elsewhere after a command is an
    // array. Both rules can parse identical contents (values are also
    // statements), so GLR explores both; prec.dynamic on `array` favors it
    // on exact ties, preserving historical array trees while letting blocks
    // win whenever an array cannot parse the contents.
    [$.block, $.array],
    // Inside `{ ... }` a bare value is ambiguous between an array element,
    // a block statement, and a menu continuation fragment; GLR resolves by
    // which rule completes against the closing brace.
    [$._statement, $.menu_continuation, $._array_element],
  ],

  rules: {
    // ── Top level ──────────────────────────────────────────────
    source_file: ($) =>
      seq(
        optional($._statement),
        repeat($._terminated_statement),
        optional(choice(";", "\n")),
      ),

    _terminated_statement: ($) =>
      seq($._statement_separator, optional($._statement)),

    _statement_separator: ($) => choice(";", "\n"),

    _statement: ($) =>
      choice(
        $.menu_command,
        $.menu_continuation,
        $.global_command,
        $._value,
        $.parent_navigation,
      ),

    line_continuation: ($) => token(seq("\\", optional("\r"), "\n")),
    parent_navigation: ($) => token(".."),

    // ── Menu commands: /path param* ───────────────────────────
    menu_command: ($) =>
      prec(2, seq(
        $.menu_prefix,
        $.root_menu,
        repeat($.sub_menu),
        repeat(choice(
          $.named_param,
          $.line_continuation,
          $._value,
        )),
      )),

    // ── Menu continuation: indented properties without / ──────
    // Lines like "    igmp-snooping=yes name=bridge" that
    // continue the previous command without a backslash.
    menu_continuation: ($) =>
      prec(1, repeat1(choice(
        $.named_param,
        $.line_continuation,
        $._value,
      ))),

    menu_prefix: ($) => "/",

    // The first identifier after / — the root menu (blue)
    // e.g. "ip" in /ip route add address=…
    root_menu: ($) => $.identifier,

    // Subsequent identifiers after the root menu (green)
    // e.g. "route", "add" in /ip route add
    sub_menu: ($) =>
      prec(1, $.identifier),

    // ── Global commands: :name (body|value|param)* ─────────────
    // Control-flow bodies may appear anywhere in the tail because
    // RouterOS puts values first: `:if ($x > 1) do={...} else={...}`,
    // `:foreach i in=[...] do={...}`, `:do {...} while=($x < 10)`.
    global_command: ($) =>
      prec(1, seq(
        $.global_command_name,
        repeat(choice(
          $._value,
          $._command_body,
          $.named_param,
        )),
      )),

    global_command_name: ($) =>
      seq(":", $.identifier),

    _command_body: ($) =>
      choice(
        $.do_block,
        $.else_block,
        $.while_condition,
        $.for_in_clause,
      ),

    // `do=` is optional: `:do {...} while=(cond)` omits the prefix.
    do_block: ($) => seq(optional(seq("do", "=")), $.block),
    else_block: ($) => seq("else", "=", $.block),
    while_condition: ($) => seq("while", "=", $.subexpression),
    for_in_clause: ($) => seq("in", "=", $._value),

    // ── Named param: key=value ───────────────────────────────
    named_param: ($) =>
      prec(1, seq(
        field("name", $.identifier),
        "=",
        optional(field("value", $._value)),
      )),

    // ── Block: { ... } ──────────────────────────────────────
    block: ($) =>
      seq(
        "{",
        optional($._statement),
        repeat($._terminated_statement),
        optional(choice(";", "\n")),
        "}",
      ),

    // ── Values ───────────────────────────────────────────────
    _value: ($) =>
      choice(
        $.literal,
        $.variable_reference,
        $.command_substitution,
        $.subexpression,
        $.array,
        $.array_access,
        $.function_call,
        $.identifier,
        $.operator,
      ),

    // ── Literals ─────────────────────────────────────────────
    literal: ($) =>
      choice(
        $.number,
        $.string,
        $.boolean_literal,
        $.nil_literal,
        $.mac_address,
        $.duration,
        $.ip_address,
        $.ip_prefix,
      ),

    // ── Operators (token only, not structured) ──────────────
    operator: ($) =>
      token(choice(
        "&&", "||",
        "!=", "<=", ">=", "=", "<", ">",
        "+", "-", "*", "/", "%",
        "&", "|", "^", "<<", ">>",
        "~", ".", ",", "!", "->",
      )),

    // ── Variable references ─────────────────────────────────
    // `$:cmd` (command shorthand after $) is accepted alongside `$var`.
    variable_reference: ($) =>
      choice(
        seq("$", $.identifier),
        seq("$", /[0-9]+/),
        seq("$", $.global_command_name),
      ),

    array_access: ($) =>
      prec(3, seq(
        field("array", choice($.variable_reference, $.identifier)),
        "->",
        field("key", choice($.string, $.identifier, $.number)),
      )),

    // ── Command substitution: [cmd] ─────────────────────────
    command_substitution: ($) =>
      seq(
        "[",
        optional($._statement),
        repeat($._terminated_statement),
        optional(choice(";", "\n")),
        "]",
      ),

    subexpression: ($) =>
      seq(
        "(",
        $._value,
        repeat($.operator),
        repeat($._value),
        ")",
      ),

    // ── Arrays: { ... } ────────────────────────────────────
    // Dynamic precedence resolves block-vs-array ties (see conflicts).
    array: ($) =>
      prec.dynamic(1, seq(
        "{",
        optional($._array_body),
        "}",
      )),

    _array_body: ($) =>
      seq(
        $._array_element,
        repeat(seq(";", $._array_element)),
        optional(";"),
      ),

    _array_element: ($) =>
      choice(
        prec(1, $.named_param),
        $._value,
      ),

    // ── Function call: $func params ─────────────────────────
    // Avoid recursion into another function_call: $a $b $c should be flat
    // arguments (or sibling values), not nested calls. Restrict args to
    // non-recursive value types (no nested function_call, array, etc.).
    function_call: ($) =>
      prec(1, seq(
        field("function", $.variable_reference),
        repeat1(choice($.named_param, $.literal, $.variable_reference, $.identifier)),
      )),

    // ── Tokens ──────────────────────────────────────────────
    // Do not allow trailing '-' so that `->` is not consumed as part of an
    // identifier (e.g. `$arr->"key"` should be `$arr` + `->` + `"key"`).
    // Dash inside is allowed via `-` + alnum segments.
    identifier: ($) =>
      /[a-zA-Z_][a-zA-Z0-9_@]*(-[a-zA-Z0-9_@]+)*/ ,

    number: ($) =>
      token(choice(
        /0[xX][0-9a-fA-F]+/,
        /[0-9]+/,
      )),

    string: ($) =>
      token(
        choice(
          seq(
            '"',
            repeat(choice(
              /[^"\\\n\r]+/,
              /\\./,
              // Line continuation inside a string (RouterOS `source=` scripts
              // span lines this way): backslash followed by an explicit newline.
              /\\\r?\n/,
            )),
            '"',
          ),
          seq(
            "'",
            repeat(choice(
              /[^'\\\n\r]+/,
              /\\./,
              /\\\r?\n/,
            )),
            "'",
          ),
        ),
      ),

    boolean_literal: ($) =>
      token(prec(2, choice("true", "false", "yes", "no"))),

    nil_literal: ($) => token("nil"),

    mac_address: ($) =>
      token(prec(2, /([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}/)),

    duration: ($) =>
      token(prec(2, /[0-9]+(ms|us|w|d|h|m|s)([0-9]+(ms|us|w|d|h|m|s))*/)),

    ip_address: ($) =>
      token(choice(
        /[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/,
        /([0-9A-Fa-f]{0,4}:){2,7}[0-9A-Fa-f]{0,4}/,
      )),

    ip_prefix: ($) =>
      token(prec(2, seq(
        choice(
          /[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/,
          /([0-9A-Fa-f]{0,4}:){2,7}[0-9A-Fa-f]{0,4}/,
        ),
        "/",
        /[0-9]+/,
      ))),

    // ── Comment: # ... ─────────────────────────────────────
    comment: ($) =>
      token(seq("#", /.*/)),
  },
});
