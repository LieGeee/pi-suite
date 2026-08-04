---
name: "restructure-obsidian-parent-child-notes"
description: "Safely split a large Obsidian note into a parent node and bidirectionally linked child nodes in this project's S:\\note\\zt vault"
version: 2
created: "2026-07-29"
updated: "2026-07-29"
---
## When to Use
Use when a large AI factory or Go IAM note in S:\note\zt has become difficult to read and should become one parent/index node with focused child notes, without flattening all children into the vault root.

## Procedure
1. Inspect the current vault tree and all wikilinks to the note being split; define one responsibility per child note.
2. Create a compressed backup using Git Bash paths such as `/s/note/_backups/...`; do not pass `S:/...` to GNU tar because the colon can be parsed as remote archive syntax.
3. Copy the complete vault to an independent staging directory. Run backup and staging commands sequentially, not in parallel, to avoid duplicate nested copies.
4. Use `rg`, `awk`, `apply_patch`, or Go—not Python—to extract sections by exact Markdown heading boundaries. Keep a parent note with scope, architecture, child map, reading order, and boundaries; put implementation details in focused child notes.
5. Add explicit parent-to-child wikilinks and put a link back to the parent at the top of every child. Add relevant previous/next sibling links, while keeping the knowledge-base root linked only to the parent.
6. Prove preservation by reconstructing the original body from extracted blocks and comparing it with `diff`; verify each former major section occurs exactly once across the new tree.
7. Validate staged notes: all wikilinks resolve, note basenames are unique, code fences are balanced, temporary markers/placeholders are absent, and Mermaid blocks remain closed.
8. Promote the staging tree. If Windows/Obsidian prevents renaming the open vault directory, first verify no partial move occurred, then copy only changed/new files into place and use `cmp` for byte-for-byte confirmation.
9. Run the same full-vault validations again on the formal path, retain the verified backup, and remove staging/extraction artifacts.

## Pitfalls
- Do not create many peer notes at the vault root; preserve a small primary reading path and hide implementation detail under the parent folder.
- Do not run backup/staging setup twice in parallel; this can create a nested duplicate vault in staging.
- Obsidian on Windows can hold a directory handle and make `mv` return Permission denied even when individual files remain writable.
- A wikilink resolves by note basename in this vault, so child basenames must remain unique.
- Do not claim content preservation merely because headings exist; compare reconstructed original content and count each old section exactly once.
- Do not leave temporary `<!-- 新增 -->` review markers after the final structural rewrite unless the user explicitly asks to retain them.
- Under MSYS/Git Bash, Perl `File::Find` may return UTF-8 filename bytes while Markdown link text is decoded Unicode. For Chinese wikilink validation, keep the raw path for `open()`, decode a second copy with `Encode::decode("UTF-8", ...)`, and compare decoded basenames; otherwise every valid link can be falsely reported broken.
- `JSON::PP::decode_json` expects UTF-8 octets and can falsely fail on already-decoded Chinese examples with `Wide character in subroutine entry`. Validate decoded Markdown blocks with `JSON::PP->new->utf8(0)->decode(...)`.
## Verification
1. `gzip -t` succeeds for the backup archive.
2. Every `[[wikilink]]` target resolves to exactly one note basename.
3. Every Markdown file has an even count of fenced-code delimiters.
4. Search finds no patch prefixes, temporary markers, placeholders, zero-width characters, or CRLF residue.
5. Each child links to the parent and the parent links to every child.
6. Every pre-split major section appears exactly once in the new tree.
7. If file-level promotion was used, `cmp` confirms each promoted file matches staging byte-for-byte.