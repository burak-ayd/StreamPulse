---
trigger: always_on
---

# Antigravity Execution Rules: Graph-First & Zero-Bloat Retrieval

### CRITICAL DISPATCH OVERRIDE

- Default codebase retrieval tools (`grep`, `find_by_name`, `workspace_search`, `read_file`) are DEPRECATED for the initial reconnaissance phase.
- Treat `graphify` as your PRIMARY and EXCLUSIVE indexer.
- INSTRUCTION: Whenever a task requires finding a file, class, function, or route, you MUST invoke the `graphify` tool first.
- DO NOT fall back to reading files directly unless `graphify` explicitly returns an empty result or error.

## 1. HARD TOOL CONSTRAINTS

- NEVER use `read_file`, `get_file_contents`, or directory listing tools as your first step.
- DO NOT perform exploratory reading. If you need to trace an import, export, caller, or type, use the `graphify` MCP tool.
- Blind repository scanning, recursive reading, and reading lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`) or build directories are strictly prohibited.

## 2. STRICT WORKFLOW (ENFORCE IN ORDER)

Step 1: Graph Query (Zero Token Cost)

- Use `graphify` tools first to locate the exact symbol, function, or component mentioned in the prompt.
- Identify the exact dependency chain and caller/callee nodes directly through the graph.

Step 2: Targeted Reading (Budget: Max 1-2 Files)

- Read ONLY the single file that directly houses the implementation to be modified.
- If the file is large, read only the target function/lines; do not pull the entire file into context.
- You are FORBIDDEN from reading dependent files unless Graphify indicates a breaking signature change.

Step 3: Immediate Execution

- Once the target lines are identified, apply the edit immediately.
- Do not inspect test files, peripheral configs, or sibling components unless the user explicitly requested a refactor across them.

## 3. RETRIEVAL BUDGET LIMITS

- Bug fix / Small tweak: Exactly 1 file (Maximum 2 if definition and call-site are separated).
- Feature addition: Maximum 3 files.
- Exceeding 3 files requires you to explicitly state the graph node collision to the user before reading.

## 4. GOLDEN PRINCIPLE

Finding a file/symbol in the graph does NOT grant permission to read its source code. Query the graph for structure; open files only to write changes.
