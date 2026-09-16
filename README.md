# Plant Operations Journal

A private, keyboard-first operations journal for Fahim Asghar. The application combines departmental pages, numbered updates, tasks, meeting minutes and assignee responsibility in one shared record system.

## First version

- OneNote-style department → subsection → page navigation
- sections, nested subsections, pages and subpages can be added, moved, renamed or deleted
- direct page drag-and-drop, dedicated section drag handles, and one-click “make subpage of page above”
- instant blank-page creation with classification fields editable on the page
- automatic numeric hierarchy numbering for sections and subsections (`1`, `1.1`, `1.1.1`)
- explicit page numbering (`1.1-P1`, with subpage `1.1-P1.1`) so pages never collide with nested section serials
- separate update numbering on each page (`1.1-P1-U1`, `1.1-P1-U2`, with child update `1.1-P1-U2.1`) so updates never collide with subpage serials
- OneNote-style writing ribbon with working rich-text formatting, lists, alignment, tags, undo and redo
- the Journal itself serves as the task manager through due, attention, status and review-age views
- visible last-edited dates on page cards and open pages
- task status, priority, due date and primary owner
- meeting register based on the Vital Agri Nutrients form
- synchronized meeting actions and journal tasks
- assignee workload and completion views
- durable D1-backed data

## Development

Use the configured package scripts for local preview, build validation and Drizzle migration generation. Sites hosting configuration is stored in `.openai/hosting.json`.
