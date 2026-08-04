# Pi GUI Codex Layout, Theme Pack, and Conversation Collections

## Scope

Refactor the Electron desktop GUI around one shared Codex-style layout while preserving the existing Pi runtime, session files, project bindings, composer, tools, settings, and IPC behavior.

## Shared Layout

All appearance presets use the same component tree and control positions. The sidebar contains Pi branding, primary navigation, a Conversations/Projects tab switcher, the active tab content, and the current profile/workspace footer. The new-thread surface contains a real hero, four prompt actions, project selection, and the existing composer. Existing-thread pages retain their timeline and composer without the new-thread hero or prompt cards.

## Appearance Presets

Built-in presets are `miku-dream`, `pure-white`, and `pi-native`. Selection is stored in persisted UI state v10. Miku Dream and Pure White use their own light palettes. Pi Native alone follows the existing System/Light/Dark color mode setting. A missing persisted external theme falls back to Pi Native.

The Miku hero is a cropped bitmap derived from the supplied reference image. It is a background asset only; all cards, selectors, and composer controls remain real Pi GUI components.

## Declarative Theme Pack

Pi GUI loads `themes/manifest.json` below its configured user-data directory. A version 1 manifest can provide theme metadata, a local hero image, and a fixed allowlist of color variables. The loader rejects invalid IDs, unsupported CSS values, remote URLs, unsupported image types, oversized images, and paths outside the theme directory. It never loads theme JavaScript.

External records merge by theme ID, allowing a theme pack to refine built-in presets or add a new preset. The renderer receives only sanitized values and a validated local file URL.

The standalone pack lives at `S:\cunchu\pi-gui-theme-pack`. Its installer targets `S:\tool\pi\gui-data\themes`, backs up an existing theme directory, and includes a restore script.

## Conversations And Groups

The Conversations tab flattens non-archived sessions across all workspaces and sorts them by latest activity. Search covers title, preview, and workspace name. A session remains in Recent after it is assigned to a group.

Groups are one level deep. Membership is a reference containing `workspaceId` and `sessionId`; assigning or dragging a session never moves its transcript, session file, worktree, or project directory. A session can belong to at most one group. Stale and duplicate references are pruned against the current workspace catalog before persistence.

The Projects tab retains the original workspace, worktree, session, archive, rename, remove, and reorder flows. Production defaults to Conversations; test runs default to Projects unless `PI_APP_DEFAULT_SIDEBAR_TAB` overrides it.

## Persistence And Recovery

UI persistence advances from v9 to v10 with `sidebarTab`, `appearanceTheme`, and `conversationGroups`. Existing v2-v9 files remain readable. Theme catalog data is runtime state and is not written into `ui-state.json`. Theme and group failures do not alter Pi agent sessions.

## Verification

Coverage includes theme loader security and fallback, external local image loading, preset persistence, dark-mode isolation, shared-layout geometry and screenshots, cross-project recent conversations, drag-to-group, group persistence, navigation, sidebar ordering/toggling, settings appearance, and desktop smoke flows. Windows packaging is verified with an isolated user-data directory before backup and installation.
