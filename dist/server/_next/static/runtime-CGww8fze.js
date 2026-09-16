import{env as e}from"cloudflare:workers";function t(){if(!e.DB)throw Error(`The journal database is not available.`);return e.DB}function n(){if(!e.FILES)throw Error(`The journal attachment storage is not available.`);return e.FILES}var r=`CREATE TABLE IF NOT EXISTS notebooks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#6d4cc2',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ).CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY,
    notebook_id TEXT NOT NULL DEFAULT 'plant-operations',
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#6d4cc2',
    parent_id TEXT,
    serial_prefix TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0
  ).CREATE TABLE IF NOT EXISTS subsections (
    id TEXT PRIMARY KEY,
    notebook_id TEXT NOT NULL DEFAULT 'plant-operations',
    department_id TEXT NOT NULL,
    parent_id TEXT,
    name TEXT NOT NULL,
    serial_prefix TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  ).CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT '',
    department_id TEXT
  ).CREATE TABLE IF NOT EXISTS pages (
    id TEXT PRIMARY KEY,
    serial TEXT NOT NULL,
    parent_id TEXT,
    subsection_id TEXT NOT NULL,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Not Started',
    priority TEXT NOT NULL DEFAULT 'Medium',
    start_date TEXT,
    due_date TEXT,
    completed_date TEXT,
    reminder_date TEXT,
    reminder_repeat TEXT NOT NULL DEFAULT 'none',
    reminder_end_date TEXT,
    reminder_closed_at TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    owner_id TEXT,
    supporting_json TEXT NOT NULL DEFAULT '[]',
    source_type TEXT NOT NULL DEFAULT 'Direct',
    source_id TEXT,
    source_label TEXT,
    source_agenda INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ).CREATE TABLE IF NOT EXISTS outline_items (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    text TEXT NOT NULL DEFAULT '',
    is_task INTEGER NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    entry_date TEXT,
    reminder_date TEXT,
    reminder_repeat TEXT NOT NULL DEFAULT 'none',
    reminder_end_date TEXT,
    reminder_closed_at TEXT
  ).CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    number TEXT NOT NULL UNIQUE,
    purpose TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL,
    venue TEXT NOT NULL DEFAULT '',
    convener TEXT NOT NULL DEFAULT '',
    called_by TEXT NOT NULL DEFAULT '',
    participants_json TEXT NOT NULL DEFAULT '[]',
    discussion TEXT NOT NULL DEFAULT '',
    update_text TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ).CREATE TABLE IF NOT EXISTS agenda_items (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    discussion TEXT NOT NULL DEFAULT '',
    action_text TEXT NOT NULL DEFAULT '',
    linked_page_id TEXT
  ).CREATE TABLE IF NOT EXISTS page_attachments (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL,
    outline_id TEXT,
    kind TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    external_url TEXT,
    repository TEXT,
    object_key TEXT,
    file_name TEXT,
    mime_type TEXT,
    size_bytes INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ).CREATE TABLE IF NOT EXISTS journal_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ).CREATE TABLE IF NOT EXISTS day_plan_items (
    id TEXT PRIMARY KEY,
    chain_id TEXT NOT NULL,
    plan_date TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Task',
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    planned_time TEXT,
    reminder_repeat TEXT NOT NULL DEFAULT 'none',
    reminder_end_date TEXT,
    reminder_closed_at TEXT,
    status TEXT NOT NULL DEFAULT 'Active',
    carried_from_id TEXT,
    carry_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TEXT,
    linked_page_id TEXT
  ).CREATE TABLE IF NOT EXISTS day_plan_details (
    id TEXT PRIMARY KEY,
    chain_id TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    text TEXT NOT NULL DEFAULT '',
    completed INTEGER NOT NULL DEFAULT 0,
    entry_date TEXT
  ).CREATE TABLE IF NOT EXISTS day_plan_attachments (
    id TEXT PRIMARY KEY,
    chain_id TEXT NOT NULL,
    detail_id TEXT,
    kind TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    object_key TEXT NOT NULL,
    file_name TEXT,
    mime_type TEXT,
    size_bytes INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ).CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ).CREATE TABLE IF NOT EXISTS push_delivery_log (
    notification_key TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL,
    reminder_kind TEXT NOT NULL,
    reminder_id TEXT NOT NULL,
    reminder_at TEXT NOT NULL,
    sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ).CREATE INDEX IF NOT EXISTS idx_subsections_department ON subsections(department_id).CREATE INDEX IF NOT EXISTS idx_pages_subsection ON pages(subsection_id).CREATE INDEX IF NOT EXISTS idx_pages_due_status ON pages(due_date, status).CREATE INDEX IF NOT EXISTS idx_pages_owner ON pages(owner_id).CREATE INDEX IF NOT EXISTS idx_pages_reminder_date ON pages(reminder_date).CREATE INDEX IF NOT EXISTS idx_outline_page_position ON outline_items(page_id, position).CREATE INDEX IF NOT EXISTS idx_agenda_meeting_position ON agenda_items(meeting_id, position).CREATE INDEX IF NOT EXISTS idx_attachments_page_created ON page_attachments(page_id, created_at).CREATE INDEX IF NOT EXISTS idx_day_plan_date_status ON day_plan_items(plan_date, status).CREATE INDEX IF NOT EXISTS idx_day_plan_chain ON day_plan_items(chain_id).CREATE INDEX IF NOT EXISTS idx_day_plan_details_chain_position ON day_plan_details(chain_id, position).CREATE INDEX IF NOT EXISTS idx_day_plan_attachments_chain_detail ON day_plan_attachments(chain_id, detail_id, created_at).CREATE INDEX IF NOT EXISTS idx_push_subscriptions_updated ON push_subscriptions(updated_at).CREATE INDEX IF NOT EXISTS idx_push_delivery_subscription ON push_delivery_log(subscription_id, sent_at)`.split(`.`),i=null;function a(e){return new Date(Date.now()+e*864e5).toISOString().slice(0,10)}async function o(){let e=t();await e.batch(r.map(t=>e.prepare(t)));let n=await e.prepare(`PRAGMA table_info(departments)`).all(),i=await e.prepare(`PRAGMA table_info(subsections)`).all(),o=await e.prepare(`PRAGMA table_info(pages)`).all(),s=await e.prepare(`PRAGMA table_info(outline_items)`).all(),c=await e.prepare(`PRAGMA table_info(day_plan_items)`).all(),l=await e.prepare(`PRAGMA table_info(page_attachments)`).all();n.results.some(e=>e.name===`parent_id`)||await e.prepare(`ALTER TABLE departments ADD COLUMN parent_id TEXT`).run(),n.results.some(e=>e.name===`serial_prefix`)||await e.prepare(`ALTER TABLE departments ADD COLUMN serial_prefix TEXT NOT NULL DEFAULT ''`).run(),n.results.some(e=>e.name===`notebook_id`)||await e.prepare(`ALTER TABLE departments ADD COLUMN notebook_id TEXT NOT NULL DEFAULT 'plant-operations'`).run(),i.results.some(e=>e.name===`parent_id`)||await e.prepare(`ALTER TABLE subsections ADD COLUMN parent_id TEXT`).run(),i.results.some(e=>e.name===`notebook_id`)||await e.prepare(`ALTER TABLE subsections ADD COLUMN notebook_id TEXT NOT NULL DEFAULT 'plant-operations'`).run(),o.results.some(e=>e.name===`start_date`)||await e.prepare(`ALTER TABLE pages ADD COLUMN start_date TEXT`).run(),o.results.some(e=>e.name===`completed_date`)||await e.prepare(`ALTER TABLE pages ADD COLUMN completed_date TEXT`).run(),o.results.some(e=>e.name===`position`)||await e.prepare(`ALTER TABLE pages ADD COLUMN position INTEGER NOT NULL DEFAULT 0`).run(),o.results.some(e=>e.name===`reminder_date`)||await e.prepare(`ALTER TABLE pages ADD COLUMN reminder_date TEXT`).run(),o.results.some(e=>e.name===`reminder_repeat`)||await e.prepare(`ALTER TABLE pages ADD COLUMN reminder_repeat TEXT NOT NULL DEFAULT 'none'`).run(),o.results.some(e=>e.name===`reminder_end_date`)||await e.prepare(`ALTER TABLE pages ADD COLUMN reminder_end_date TEXT`).run(),o.results.some(e=>e.name===`reminder_closed_at`)||await e.prepare(`ALTER TABLE pages ADD COLUMN reminder_closed_at TEXT`).run(),s.results.some(e=>e.name===`entry_date`)||await e.prepare(`ALTER TABLE outline_items ADD COLUMN entry_date TEXT`).run(),s.results.some(e=>e.name===`reminder_date`)||await e.prepare(`ALTER TABLE outline_items ADD COLUMN reminder_date TEXT`).run(),s.results.some(e=>e.name===`reminder_repeat`)||await e.prepare(`ALTER TABLE outline_items ADD COLUMN reminder_repeat TEXT NOT NULL DEFAULT 'none'`).run(),s.results.some(e=>e.name===`reminder_end_date`)||await e.prepare(`ALTER TABLE outline_items ADD COLUMN reminder_end_date TEXT`).run(),s.results.some(e=>e.name===`reminder_closed_at`)||await e.prepare(`ALTER TABLE outline_items ADD COLUMN reminder_closed_at TEXT`).run(),s.results.some(e=>e.name===`is_task`)||(await e.prepare(`ALTER TABLE outline_items ADD COLUMN is_task INTEGER NOT NULL DEFAULT 0`).run(),await e.prepare(`UPDATE outline_items SET is_task = 1 WHERE completed = 1`).run()),c.results.some(e=>e.name===`linked_page_id`)||await e.prepare(`ALTER TABLE day_plan_items ADD COLUMN linked_page_id TEXT`).run(),c.results.some(e=>e.name===`reminder_repeat`)||await e.prepare(`ALTER TABLE day_plan_items ADD COLUMN reminder_repeat TEXT NOT NULL DEFAULT 'none'`).run(),c.results.some(e=>e.name===`reminder_end_date`)||await e.prepare(`ALTER TABLE day_plan_items ADD COLUMN reminder_end_date TEXT`).run(),c.results.some(e=>e.name===`reminder_closed_at`)||await e.prepare(`ALTER TABLE day_plan_items ADD COLUMN reminder_closed_at TEXT`).run(),l.results.some(e=>e.name===`outline_id`)||await e.prepare(`ALTER TABLE page_attachments ADD COLUMN outline_id TEXT`).run(),await e.batch([e.prepare(`CREATE INDEX IF NOT EXISTS idx_subsections_parent ON subsections(parent_id)`),e.prepare(`CREATE INDEX IF NOT EXISTS idx_departments_parent ON departments(parent_id)`),e.prepare(`CREATE INDEX IF NOT EXISTS idx_departments_notebook_position ON departments(notebook_id, position)`),e.prepare(`CREATE INDEX IF NOT EXISTS idx_subsections_notebook_position ON subsections(notebook_id, position)`),e.prepare(`CREATE INDEX IF NOT EXISTS idx_outline_reminder_date ON outline_items(reminder_date)`),e.prepare(`CREATE INDEX IF NOT EXISTS idx_pages_reminder_date ON pages(reminder_date)`),e.prepare(`CREATE INDEX IF NOT EXISTS idx_day_plan_details_chain_position ON day_plan_details(chain_id, position)`),e.prepare(`CREATE INDEX IF NOT EXISTS idx_attachments_outline_created ON page_attachments(outline_id, created_at)`),e.prepare(`CREATE INDEX IF NOT EXISTS idx_day_plan_attachments_chain_detail ON day_plan_attachments(chain_id, detail_id, created_at)`)]),await e.prepare(`PRAGMA optimize`).run(),await e.prepare(`INSERT INTO notebooks (id, name, color, position)
    VALUES ('plant-operations', 'Plant Operations Notebook', '#6d4cc2', 1)
    ON CONFLICT(id) DO NOTHING`).run(),await e.batch([e.prepare(`UPDATE departments SET serial_prefix = '1' WHERE id = 'production' AND serial_prefix = ''`),e.prepare(`UPDATE departments SET serial_prefix = '2' WHERE id = 'supply-chain' AND serial_prefix = ''`),e.prepare(`UPDATE departments SET serial_prefix = '3' WHERE id = 'operations-ir' AND serial_prefix = ''`),e.prepare(`UPDATE departments SET serial_prefix = '4' WHERE id = 'qc-lab' AND serial_prefix = ''`),e.prepare(`UPDATE departments SET serial_prefix = '5' WHERE id = 'research' AND serial_prefix = ''`),e.prepare(`UPDATE departments SET serial_prefix = '6' WHERE id = 'rm-mechanical' AND serial_prefix = ''`),e.prepare(`UPDATE departments SET serial_prefix = '7' WHERE id = 'rm-electrical' AND serial_prefix = ''`),e.prepare(`UPDATE departments SET serial_prefix = '8' WHERE id = 'rm-civil' AND serial_prefix = ''`),e.prepare(`UPDATE departments SET serial_prefix = '9' WHERE id = 'policies' AND serial_prefix = ''`),e.prepare(`UPDATE departments SET serial_prefix = '10' WHERE id = 'farming' AND serial_prefix = ''`),e.prepare(`UPDATE subsections SET parent_id = department_id WHERE parent_id IS NULL AND department_id != id`),e.prepare(`UPDATE departments SET notebook_id = 'plant-operations' WHERE notebook_id IS NULL OR notebook_id = ''`),e.prepare(`UPDATE subsections SET notebook_id = 'plant-operations' WHERE notebook_id IS NULL OR notebook_id = ''`),e.prepare(`UPDATE outline_items SET entry_date = COALESCE((SELECT substr(created_at, 1, 10) FROM pages WHERE pages.id = outline_items.page_id), date('now')) WHERE entry_date IS NULL OR entry_date = ''`),e.prepare(`INSERT INTO day_plan_details (id, chain_id, level, position, text, completed, entry_date)
      SELECT 'legacy-' || id, chain_id, 0, 0, notes, 0, COALESCE(substr(created_at, 1, 10), date('now'))
      FROM day_plan_items
      WHERE notes != ''
        AND id = (SELECT original.id FROM day_plan_items AS original WHERE original.chain_id = day_plan_items.chain_id ORDER BY original.created_at, original.id LIMIT 1)
        AND NOT EXISTS (SELECT 1 FROM day_plan_details WHERE day_plan_details.chain_id = day_plan_items.chain_id)`)]);let u=await e.prepare(`SELECT COUNT(*) AS count FROM departments`).first();if(Number(u?.count??0)>0)return;let d=[[`production`,`Production`,`#6d4cc2`,null,`1`,1],[`supply-chain`,`Supply Chain`,`#167f73`,null,`2`,2],[`operations-ir`,`Operations / IR`,`#c47a24`,null,`3`,3],[`qc-lab`,`QC Lab`,`#2e6aa5`,null,`4`,4],[`research`,`R&D`,`#8c4f9c`,null,`5`,5],[`rm-mechanical`,`R&M Mechanical`,`#667085`,null,`6`,6],[`rm-electrical`,`R&M Electrical`,`#667085`,null,`7`,7],[`rm-civil`,`R&M Civil`,`#667085`,null,`8`,8],[`policies`,`Policies & SOPs`,`#45665a`,null,`9`,9],[`farming`,`Farming`,`#4f7b3f`,null,`10`,10]],f=[[`alkali`,`production`,`production`,`Alkali Unit`,`1.1`,1],[`npk-solid`,`production`,`production`,`NPK Solid`,`1.2`,2],[`npk-liquid`,`production`,`production`,`NPK Liquid`,`1.3`,3],[`granulation`,`production`,`production`,`Granulation`,`1.4`,4],[`procurement`,`supply-chain`,`supply-chain`,`Procurement`,`2.1`,1],[`stores`,`supply-chain`,`supply-chain`,`Stores`,`2.2`,2],[`ir`,`operations-ir`,`operations-ir`,`Industrial Relations`,`3.1`,1],[`calibration`,`qc-lab`,`qc-lab`,`Calibration`,`4.1`,1],[`lab-testing`,`qc-lab`,`qc-lab`,`Lab Testing`,`4.2`,2],[`trials`,`research`,`research`,`Product Trials`,`5.1`,1],[`mechanical-plant`,`rm-mechanical`,`rm-mechanical`,`Plant Maintenance`,`6.1`,1],[`electrical-plant`,`rm-electrical`,`rm-electrical`,`Plant Electrical`,`7.1`,1],[`civil-works`,`rm-civil`,`rm-civil`,`Civil Works`,`8.1`,1],[`sop-production`,`policies`,`policies`,`Production SOPs`,`9.1`,1],[`farm-operations`,`farming`,`farming`,`Farm Operations`,`10.1`,1]],p=[[`fahim`,`Fahim Asghar`,`Plant Operations`,`production`],[`himayat`,`Himayat Hussain`,`Production`,`production`],[`usman`,`Usman Ali`,`QC Lab`,`qc-lab`],[`saad`,`Saad Ahmed`,`Mechanical`,`rm-mechanical`],[`adeel`,`Adeel Khan`,`Supply Chain`,`supply-chain`]],m=[];for(let t of d)m.push(e.prepare(`INSERT INTO departments (id, notebook_id, name, color, parent_id, serial_prefix, position) VALUES (?, 'plant-operations', ?, ?, ?, ?, ?)`).bind(...t));for(let t of f)m.push(e.prepare(`INSERT INTO subsections (id, notebook_id, department_id, parent_id, name, serial_prefix, position) VALUES (?, 'plant-operations', ?, ?, ?, ?, ?)`).bind(...t));for(let t of p)m.push(e.prepare(`INSERT INTO people (id, name, role, department_id) VALUES (?, ?, ?, ?)`).bind(...t));let h=[[`page-crusher`,`1.2.1`,`npk-solid`,`Roller Crusher Trial`,`Trial settings, product response and operating observations.`,`In Progress`,`High`,a(0),`himayat`,`["fahim"]`,`Meeting`,`meeting-026`,`M-026 · Agenda 4`,4],[`page-scrubber`,`1.2.2`,`npk-solid`,`Check scrubber pH trend`,`Confirm the shift-wise pH trend and corrective actions.`,`Requires Attention`,`High`,a(-1),`himayat`,`["usman"]`,`Direct`,null,`Journal entry`,null],[`page-sop`,`1.3.1`,`npk-liquid`,`Review dosing start-up SOP`,`Review operator feedback before releasing the revision.`,`Not Started`,`Medium`,a(0),`fahim`,`[]`,`Direct`,null,`Journal entry`,null],[`page-calibration`,`4.1.1`,`calibration`,`Calibration quotation follow-up`,`Obtain revised commercial offer and delivery schedule.`,`Waiting`,`Medium`,a(2),`usman`,`["adeel"]`,`Meeting`,`meeting-025`,`M-025 · Agenda 2`,2],[`page-bearing`,`6.1.1`,`mechanical-plant`,`Granulator bearing inspection`,`Check vibration reading and lubrication condition.`,`In Progress`,`High`,a(1),`saad`,`[]`,`Direct`,null,`Journal entry`,null],[`page-training`,`9.1.1`,`sop-production`,`Shift handover checklist`,`Prepare a concise checklist for all production shifts.`,`Completed`,`Low`,a(-2),`fahim`,`["himayat"]`,`Direct`,null,`Journal entry`,null]];for(let t of h)m.push(e.prepare(`INSERT INTO pages
      (id, serial, subsection_id, title, notes, status, priority, due_date, owner_id, supporting_json, source_type, source_id, source_label, source_agenda)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...t));for(let t of[[`outline-1`,`page-crusher`,0,0,`Trial scheduled with Production after morning inspection.`,0],[`outline-2`,`page-crusher`,0,1,`Verify feed moisture before starting the crusher.`,0],[`outline-3`,`page-crusher`,1,2,`Record amperage at each roller-gap setting.`,0],[`outline-4`,`page-crusher`,1,3,`Collect product samples for sieve analysis.`,0],[`outline-5`,`page-crusher`,0,4,`Review results with QC Lab and update the meeting action.`,0],[`outline-6`,`page-scrubber`,0,0,`Compare the last three shifts and flag readings below the operating band.`,0]])m.push(e.prepare(`INSERT INTO outline_items (id, page_id, level, position, text, completed) VALUES (?, ?, ?, ?, ?, ?)`).bind(...t));let g=[[`meeting-026`,`M-026`,`Roller Crusher Trial & Production Review`,a(0),`Main Conference Room`,`Fahim Asghar`,`Plant Operations`,`["Fahim Asghar","Himayat Hussain","Usman Ali","Saad Ahmed"]`,`The team reviewed crusher readiness, feed condition and the sampling plan.`,`Trial to be completed with operating observations attached to the journal page.`],[`meeting-025`,`M-025`,`QC Calibration & Lab Requirements`,a(-3),`QC Lab`,`Usman Ali`,`Plant Operations`,`["Fahim Asghar","Usman Ali","Adeel Khan"]`,`Open calibration items and supplier response were reviewed.`,`Revised quotation is awaited from the supplier.`]];for(let t of g)m.push(e.prepare(`INSERT INTO meetings
      (id, number, purpose, date, venue, convener, called_by, participants_json, discussion, update_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...t));for(let t of[[`agenda-026-1`,`meeting-026`,1,`Production status`,`Review current operating conditions.`,`Continue shift-wise monitoring.`,null],[`agenda-026-2`,`meeting-026`,2,`Feed condition`,`Moisture variation may affect crusher response.`,`Record moisture before each setting.`,null],[`agenda-026-3`,`meeting-026`,3,`QC sampling`,`Sampling points and sieve analysis were agreed.`,`QC to collect samples during trial.`,null],[`agenda-026-4`,`meeting-026`,4,`Roller Crusher Trial`,`Confirm the trial sequence and safe operating window.`,`Roller Crusher Trial`,`page-crusher`],[`agenda-025-1`,`meeting-025`,1,`Calibration due list`,`Reviewed instruments due this month.`,`Prepare consolidated due list.`,null],[`agenda-025-2`,`meeting-025`,2,`Supplier quotation`,`Commercial offer requires revision.`,`Calibration quotation follow-up`,`page-calibration`]])m.push(e.prepare(`INSERT INTO agenda_items (id, meeting_id, position, title, discussion, action_text, linked_page_id) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(...t));await e.batch(m),await e.prepare(`PRAGMA optimize`).run()}async function s(){e.JOURNAL_RUNTIME_INIT===`development`&&(i||=o().catch(e=>{throw i=null,e}),await i)}export{n,s as r,t};