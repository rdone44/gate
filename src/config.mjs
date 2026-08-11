// src/config.mjs
// Configuration support for github-actions-gate v1.1.0.
// Reads an optional .gate-config.json that lets users disable specific rules.
//
// No config file = all five rules active (backward compatible).
// Config is additive: only `rules` can be toggled; the five-rule core
// is immutable (no adding custom rules, no changing rule order).

import { readFileSync } from "node:fs";

const VALID_RULE_IDS = [
  "task-associated",
  "commit-exists",
  "ci-passes",
  "test-report-exists",
  "pr-merged",
];

class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigError";
    this.isConfigError = true;
  }
}

// Parse and validate a config JSON string.
// Returns a normalized config object: { rules: { "rule-id": true|false, ... } }
// All five rules default to true (enabled) unless explicitly disabled.
export function parseConfig(jsonText) {
  let raw;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new ConfigError("config is not valid JSON");
  }

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ConfigError("config must be a JSON object");
  }

  const config = { rules: {} };

  // Initialize all rules to enabled.
  for (const id of VALID_RULE_IDS) {
    config.rules[id] = true;
  }

  if (raw.rules !== undefined) {
    if (raw.rules === null || typeof raw.rules !== "object" || Array.isArray(raw.rules)) {
      throw new ConfigError("config.rules must be an object");
    }
    for (const key of Object.keys(raw.rules)) {
      if (!VALID_RULE_IDS.includes(key)) {
        throw new ConfigError(`unknown rule id '${key}' in config (valid: ${VALID_RULE_IDS.join(", ")})`);
      }
      const val = raw.rules[key];
      if (typeof val !== "boolean") {
        throw new ConfigError(`config.rules['${key}'] must be boolean, got ${typeof val}`);
      }
      config.rules[key] = val;
    }
  }

  return config;
}

// Read a config file from a path. Returns the parsed config.
export function loadConfigFile(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    throw new ConfigError(`cannot read config file: ${path} (${e.message})`);
  }
  return parseConfig(text);
}

// Default config: all rules enabled.
export function defaultConfig() {
  const config = { rules: {} };
  for (const id of VALID_RULE_IDS) {
    config.rules[id] = true;
  }
  return config;
}

// Check if a rule is enabled given a config object.
export function isRuleEnabled(config, ruleId) {
  if (!config || !config.rules) return true;
  const v = config.rules[ruleId];
  return v === undefined ? true : v;
}

export { ConfigError, VALID_RULE_IDS };
