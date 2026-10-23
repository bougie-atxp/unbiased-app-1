# Projects sharing source folders

A project has a stable `id`. Its `primary` folder is the working directory
for new chats, not its identity. Multiple projects may select the same folder
as primary or additional source. Editing, removing, archiving, sidebar keys,
navigation, work-mode preferences and explicit chat assignment use project IDs.
Filesystem and Git operations still use the actual folder/worktree path.

`projects.json` gains IDs on first read. Existing projects retain a
`legacyMemoryPath` so their saved notes and old work-mode preference remain
available. New projects use a memory directory under `memory/projects/<id>`;
they do not inherit another project's notes just because the source matches.

`project-memberships.json` stores explicit thread-to-project IDs, including
null for chats started without a project. Main and Mosaic chat creation save
the selected project ID, including when the chat runs in a worktree. Side chats
inherit their parent's selection. Moving a chat updates membership without
changing the engine's pinned working directory.

For older threads, the store preserves the previous folder-to-project mapping
before a new project can claim the same folder. Legacy `thread-projects.json`
path overrides remain intact and are consulted during migration. Historical
folder ownership is retained after project removal, so unread or archived old
chats cannot move into a different project that happens to share its folder.
Removing a project leaves those chats visible in Recents. Explicitly moving a
chat to a remaining project is still supported.

The JSON stores are written through a temporary file and rename. Their
read-modify-write operations are synchronous on Electron's main thread.
Unreadable JSON raises an error rather than replacing user data with an empty
store. No engine or server protocol change is required.
