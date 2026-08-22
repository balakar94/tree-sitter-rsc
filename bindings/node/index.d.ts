type Language = import("tree-sitter").Language;

declare const binding: {
  /** Grammar name registered by the native binding ("rsc"). */
  name: string;
  /** Pointer to the TSLanguage instance exported by the native binding. */
  language: Language;
};

export = binding;
