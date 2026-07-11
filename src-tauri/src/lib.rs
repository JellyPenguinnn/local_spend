use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

type CmdResult<T> = Result<T, String>;

const KEYRING_SERVICE: &str = "LocalSpend";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileMeta {
    id: String,
    display_name: String,
    color: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfilesState {
    active_profile_id: Option<String>,
    profiles: Vec<ProfileMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    id: String,
    name: String,
    color: String,
    icon: Option<String>,
    sort_order: i64,
    is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Expense {
    id: String,
    amount: f64,
    currency: String,
    base_amount: f64,
    base_currency: String,
    exchange_rate: f64,
    exchange_rate_date: String,
    exchange_rate_source: String,
    date: String,
    category_id: String,
    title: Option<String>,
    remark: Option<String>,
    payment_method: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Budget {
    id: String,
    month: String,
    category_id: Option<String>,
    amount: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecurringRule {
    id: String,
    title: String,
    amount: f64,
    currency: String,
    category_id: String,
    remark: Option<String>,
    payment_method: Option<String>,
    cadence: String,
    day_of_month: Option<i64>,
    start_date: String,
    next_date: String,
    #[serde(default)]
    discarded_dates: Vec<String>,
    is_active: bool,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    currency: String,
    enabled_currencies: Vec<String>,
    theme: String,
    accent_color: String,
    accent_palette: Vec<String>,
    payment_methods: Vec<String>,
    wallpapers: Vec<WallpaperImage>,
    active_wallpaper_id: Option<String>,
    wallpaper_opacity: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WallpaperImage {
    id: String,
    name: String,
    data_url: String,
    mime_type: String,
    size_bytes: i64,
    created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSettings {
    provider: String,
    base_url: Option<String>,
    model: Option<String>,
    timeout_ms: i64,
    max_tokens: i64,
    api_key_saved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileData {
    categories: Vec<Category>,
    expenses: Vec<Expense>,
    budgets: Vec<Budget>,
    recurring_rules: Vec<RecurringRule>,
    app_settings: AppSettings,
    ai_settings: AiSettings,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProfileInput {
    display_name: String,
    color: Option<String>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_profiles,
            create_profile,
            switch_profile,
            rename_profile,
            delete_profile,
            get_profile_data,
            save_profile_data,
            reset_profile_data,
            save_profile_file,
            set_ai_secret,
            get_ai_secret,
            clear_ai_secret,
            has_ai_secret,
            data_root_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn list_profiles(app: AppHandle) -> CmdResult<ProfilesState> {
    read_profiles(&app)
}

#[tauri::command]
fn create_profile(app: AppHandle, input: CreateProfileInput) -> CmdResult<ProfilesState> {
    let display_name = input.display_name.trim();
    if display_name.is_empty() {
        return Err("Please enter a profile name.".to_string());
    }

    let mut state = read_profiles(&app)?;
    let now = now_iso();
    let color = input
        .color
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| next_profile_color(state.profiles.len()));
    let profile = ProfileMeta {
        id: format!("profile_{}", Uuid::new_v4().simple()),
        display_name: display_name.to_string(),
        color,
        created_at: now.clone(),
        updated_at: now,
    };

    ensure_profile_dirs(&app, &profile.id)?;
    let conn = open_profile_db(&app, &profile.id)?;
    initialize_database(&conn)?;

    state.active_profile_id = Some(profile.id.clone());
    state.profiles.push(profile);
    write_profiles(&app, &state)?;
    Ok(state)
}

#[tauri::command]
fn switch_profile(app: AppHandle, profile_id: String) -> CmdResult<ProfilesState> {
    let mut state = read_profiles(&app)?;
    ensure_profile_exists(&state, &profile_id)?;
    state.active_profile_id = Some(profile_id);
    write_profiles(&app, &state)?;
    Ok(state)
}

#[tauri::command]
fn rename_profile(app: AppHandle, profile_id: String, display_name: String, color: Option<String>) -> CmdResult<ProfilesState> {
    let trimmed = display_name.trim();
    if trimmed.is_empty() {
        return Err("Please enter a profile name.".to_string());
    }

    let mut state = read_profiles(&app)?;
    let profile = state
        .profiles
        .iter_mut()
        .find(|profile| profile.id == profile_id)
        .ok_or_else(|| "Profile not found.".to_string())?;
    profile.display_name = trimmed.to_string();
    if let Some(color) = color.filter(|value| !value.trim().is_empty()) {
        profile.color = color;
    }
    profile.updated_at = now_iso();
    write_profiles(&app, &state)?;
    Ok(state)
}

#[tauri::command]
fn delete_profile(app: AppHandle, profile_id: String) -> CmdResult<ProfilesState> {
    let mut state = read_profiles(&app)?;
    ensure_profile_exists(&state, &profile_id)?;
    state.profiles.retain(|profile| profile.id != profile_id);
    if state.active_profile_id.as_deref() == Some(profile_id.as_str()) {
        state.active_profile_id = state.profiles.first().map(|profile| profile.id.clone());
    }
    let profile_dir = profile_dir(&app, &profile_id)?;
    if profile_dir.exists() {
        fs::remove_dir_all(&profile_dir).map_err(|err| format!("Could not delete profile data: {err}"))?;
    }
    write_profiles(&app, &state)?;
    Ok(state)
}

#[tauri::command]
fn get_profile_data(app: AppHandle, profile_id: String) -> CmdResult<ProfileData> {
    let state = read_profiles(&app)?;
    ensure_profile_exists(&state, &profile_id)?;
    let conn = open_profile_db(&app, &profile_id)?;
    initialize_database(&conn)?;
    load_profile_data(&conn)
}

#[tauri::command]
fn save_profile_data(app: AppHandle, profile_id: String, data: ProfileData) -> CmdResult<ProfileData> {
    let state = read_profiles(&app)?;
    ensure_profile_exists(&state, &profile_id)?;
    let mut conn = open_profile_db(&app, &profile_id)?;
    initialize_database(&conn)?;
    persist_profile_data(&mut conn, &data)?;
    load_profile_data(&conn)
}

#[tauri::command]
fn reset_profile_data(app: AppHandle, profile_id: String) -> CmdResult<ProfileData> {
    let state = read_profiles(&app)?;
    ensure_profile_exists(&state, &profile_id)?;
    let mut conn = open_profile_db(&app, &profile_id)?;
    initialize_database(&conn)?;
    let data = default_profile_data();
    persist_profile_data(&mut conn, &data)?;
    Ok(data)
}

#[tauri::command]
fn save_profile_file(app: AppHandle, profile_id: String, kind: String, file_name: String, contents: String) -> CmdResult<String> {
    let state = read_profiles(&app)?;
    ensure_profile_exists(&state, &profile_id)?;
    let folder = match kind.as_str() {
        "backup" | "backups" => "backups",
        "export" | "exports" => "exports",
        _ => return Err("Unknown file kind.".to_string()),
    };
    let base = profile_dir(&app, &profile_id)?.join(folder);
    fs::create_dir_all(&base).map_err(|err| format!("Could not create {folder} directory: {err}"))?;
    let path = base.join(sanitize_file_name(&file_name));
    fs::write(&path, contents).map_err(|err| format!("Could not save file: {err}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn set_ai_secret(profile_id: String, provider: String, secret: String) -> CmdResult<bool> {
    if secret.trim().is_empty() {
        return Err("API key cannot be blank.".to_string());
    }
    let entry = keyring::Entry::new(KEYRING_SERVICE, &keyring_account(&profile_id, &provider))
        .map_err(|err| format!("Could not open keyring: {err}"))?;
    entry
        .set_password(secret.trim())
        .map_err(|err| format!("Could not save API key: {err}"))?;
    Ok(true)
}

#[tauri::command]
fn get_ai_secret(profile_id: String, provider: String) -> CmdResult<Option<String>> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &keyring_account(&profile_id, &provider))
        .map_err(|err| format!("Could not open keyring: {err}"))?;
    match entry.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(format!("Could not read API key: {err}")),
    }
}

#[tauri::command]
fn clear_ai_secret(profile_id: String, provider: String) -> CmdResult<bool> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &keyring_account(&profile_id, &provider))
        .map_err(|err| format!("Could not open keyring: {err}"))?;
    match entry.delete_password() {
        Ok(()) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(err) => Err(format!("Could not clear API key: {err}")),
    }
}

#[tauri::command]
fn has_ai_secret(profile_id: String, provider: String) -> CmdResult<bool> {
    Ok(get_ai_secret(profile_id, provider)?.is_some())
}

#[tauri::command]
fn data_root_path(app: AppHandle) -> CmdResult<String> {
    Ok(data_root(&app)?.to_string_lossy().to_string())
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn keyring_account(profile_id: &str, provider: &str) -> String {
    format!("{profile_id}:{provider}")
}

fn data_root(app: &AppHandle) -> CmdResult<PathBuf> {
    if let Ok(path) = std::env::var("LOCALSPEND_DATA_DIR") {
        let root = PathBuf::from(path);
        fs::create_dir_all(&root).map_err(|err| format!("Could not create data directory: {err}"))?;
        return Ok(root);
    }
    let root = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Could not resolve app data directory: {err}"))?;
    fs::create_dir_all(&root).map_err(|err| format!("Could not create app data directory: {err}"))?;
    Ok(root)
}

fn profiles_path(app: &AppHandle) -> CmdResult<PathBuf> {
    Ok(data_root(app)?.join("profiles.json"))
}

fn profile_dir(app: &AppHandle, profile_id: &str) -> CmdResult<PathBuf> {
    Ok(data_root(app)?.join("profiles").join(profile_id))
}

fn profile_db_path(app: &AppHandle, profile_id: &str) -> CmdResult<PathBuf> {
    Ok(profile_dir(app, profile_id)?.join("localspend.sqlite"))
}

fn ensure_profile_dirs(app: &AppHandle, profile_id: &str) -> CmdResult<()> {
    let dir = profile_dir(app, profile_id)?;
    fs::create_dir_all(dir.join("backups")).map_err(|err| format!("Could not create backup directory: {err}"))?;
    fs::create_dir_all(dir.join("exports")).map_err(|err| format!("Could not create export directory: {err}"))?;
    Ok(())
}

fn read_profiles(app: &AppHandle) -> CmdResult<ProfilesState> {
    let path = profiles_path(app)?;
    if !path.exists() {
        return Ok(ProfilesState {
            active_profile_id: None,
            profiles: Vec::new(),
        });
    }
    let contents = fs::read_to_string(&path).map_err(|err| format!("Could not read profiles: {err}"))?;
    let mut state: ProfilesState =
        serde_json::from_str(&contents).map_err(|err| format!("Could not parse profiles: {err}"))?;
    if let Some(active) = state.active_profile_id.clone() {
        if !state.profiles.iter().any(|profile| profile.id == active) {
            state.active_profile_id = state.profiles.first().map(|profile| profile.id.clone());
        }
    }
    Ok(state)
}

fn write_profiles(app: &AppHandle, state: &ProfilesState) -> CmdResult<()> {
    let path = profiles_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("Could not create data directory: {err}"))?;
    }
    let contents = serde_json::to_string_pretty(state).map_err(|err| format!("Could not serialize profiles: {err}"))?;
    fs::write(path, contents).map_err(|err| format!("Could not write profiles: {err}"))
}

fn ensure_profile_exists(state: &ProfilesState, profile_id: &str) -> CmdResult<()> {
    if state.profiles.iter().any(|profile| profile.id == profile_id) {
        Ok(())
    } else {
        Err("Profile not found.".to_string())
    }
}

fn open_profile_db(app: &AppHandle, profile_id: &str) -> CmdResult<Connection> {
    ensure_profile_dirs(app, profile_id)?;
    let path = profile_db_path(app, profile_id)?;
    let conn = Connection::open(path).map_err(|err| format!("Could not open database: {err}"))?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|err| format!("Could not enable database constraints: {err}"))?;
    Ok(conn)
}

fn initialize_database(conn: &Connection) -> CmdResult<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          description TEXT NOT NULL,
          applied_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS categories (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          color TEXT NOT NULL,
          icon TEXT,
          sort_order INTEGER NOT NULL,
          is_default INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS expenses (
          id TEXT PRIMARY KEY,
          amount REAL NOT NULL CHECK(amount > 0),
          currency TEXT NOT NULL,
          base_amount REAL NOT NULL CHECK(base_amount > 0),
          base_currency TEXT NOT NULL,
          exchange_rate REAL NOT NULL CHECK(exchange_rate > 0),
          exchange_rate_date TEXT NOT NULL,
          exchange_rate_source TEXT NOT NULL,
          date TEXT NOT NULL,
          category_id TEXT NOT NULL,
          title TEXT,
          remark TEXT,
          payment_method TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(category_id) REFERENCES categories(id)
        );

        CREATE TABLE IF NOT EXISTS budgets (
          id TEXT PRIMARY KEY,
          month TEXT NOT NULL,
          category_id TEXT,
          amount REAL NOT NULL CHECK(amount >= 0),
          FOREIGN KEY(category_id) REFERENCES categories(id)
        );

        CREATE TABLE IF NOT EXISTS recurring_rules (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          amount REAL NOT NULL CHECK(amount > 0),
          currency TEXT NOT NULL,
          category_id TEXT NOT NULL,
          remark TEXT,
          payment_method TEXT,
          cadence TEXT NOT NULL,
          day_of_month INTEGER,
          start_date TEXT,
          next_date TEXT NOT NULL,
          discarded_dates TEXT NOT NULL DEFAULT '[]',
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(category_id) REFERENCES categories(id)
        );

        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ai_settings (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          base_url TEXT,
          model TEXT,
          timeout_ms INTEGER NOT NULL,
          max_tokens INTEGER NOT NULL,
          api_key_saved INTEGER NOT NULL DEFAULT 0
        );

        INSERT OR IGNORE INTO schema_migrations(version, description, applied_at)
        VALUES (1, 'initial_localspend_schema', datetime('now'));
        ",
    )
    .map_err(|err| format!("Could not initialize database: {err}"))?;
    ensure_recurring_start_date(conn)?;
    ensure_recurring_discarded_dates(conn)?;
    ensure_expense_currency_snapshot(conn)?;
    conn.execute(
        "INSERT OR IGNORE INTO schema_migrations(version, description, applied_at)
         VALUES (2, 'stable_multi_currency_expense_snapshots', datetime('now'))",
        [],
    )
    .map_err(|err| format!("Could not record multi-currency migration: {err}"))?;

    let category_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM categories", [], |row| row.get(0))
        .map_err(|err| format!("Could not inspect categories: {err}"))?;
    if category_count == 0 {
        seed_default_categories(conn)?;
    }

    let settings_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM app_settings", [], |row| row.get(0))
        .map_err(|err| format!("Could not inspect settings: {err}"))?;
    if settings_count == 0 {
        write_app_settings(conn, &default_app_settings())?;
    }

    let ai_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM ai_settings", [], |row| row.get(0))
        .map_err(|err| format!("Could not inspect AI settings: {err}"))?;
    if ai_count == 0 {
        write_ai_settings(conn, &default_ai_settings())?;
    }

    Ok(())
}

fn ensure_expense_currency_snapshot(conn: &Connection) -> CmdResult<()> {
    let mut stmt = conn
        .prepare("PRAGMA table_info(expenses)")
        .map_err(|err| format!("Could not inspect expenses schema: {err}"))?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|err| format!("Could not read expenses schema: {err}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("Could not map expenses schema: {err}"))?;
    drop(stmt);

    for (name, sql_type) in [
        ("base_amount", "REAL"),
        ("base_currency", "TEXT"),
        ("exchange_rate", "REAL"),
        ("exchange_rate_date", "TEXT"),
        ("exchange_rate_source", "TEXT"),
    ] {
        if !columns.iter().any(|column| column == name) {
            conn.execute(&format!("ALTER TABLE expenses ADD COLUMN {name} {sql_type}"), [])
                .map_err(|err| format!("Could not add expense {name}: {err}"))?;
        }
    }

    conn.execute(
        "UPDATE expenses
         SET base_amount = COALESCE(base_amount, amount),
             base_currency = COALESCE(NULLIF(base_currency, ''), (SELECT value FROM app_settings WHERE key = 'currency'), currency),
             exchange_rate = COALESCE(exchange_rate, 1),
             exchange_rate_date = COALESCE(NULLIF(exchange_rate_date, ''), date),
             exchange_rate_source = COALESCE(NULLIF(exchange_rate_source, ''),
               CASE WHEN currency = COALESCE((SELECT value FROM app_settings WHERE key = 'currency'), currency) THEN 'base' ELSE 'legacy' END)",
        [],
    )
    .map_err(|err| format!("Could not backfill expense currency snapshots: {err}"))?;
    Ok(())
}

fn ensure_recurring_start_date(conn: &Connection) -> CmdResult<()> {
    let mut stmt = conn
        .prepare("PRAGMA table_info(recurring_rules)")
        .map_err(|err| format!("Could not inspect recurring rules schema: {err}"))?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|err| format!("Could not read recurring rules schema: {err}"))?;
    let mut has_start_date = false;
    for column in columns {
        if column.map_err(|err| format!("Could not map recurring rules schema: {err}"))? == "start_date" {
            has_start_date = true;
            break;
        }
    }
    if !has_start_date {
        conn.execute("ALTER TABLE recurring_rules ADD COLUMN start_date TEXT", [])
            .map_err(|err| format!("Could not add recurring rule start date: {err}"))?;
    }
    conn.execute(
        "UPDATE recurring_rules
         SET start_date = (
           SELECT MIN(expenses.date)
           FROM expenses
           WHERE expenses.amount = recurring_rules.amount
             AND COALESCE(expenses.title, '') = recurring_rules.title
             AND expenses.category_id = recurring_rules.category_id
             AND COALESCE(expenses.payment_method, '') = COALESCE(recurring_rules.payment_method, '')
         )
         WHERE (start_date IS NULL OR start_date = '')
           AND EXISTS (
             SELECT 1
             FROM expenses
             WHERE expenses.amount = recurring_rules.amount
               AND COALESCE(expenses.title, '') = recurring_rules.title
               AND expenses.category_id = recurring_rules.category_id
               AND COALESCE(expenses.payment_method, '') = COALESCE(recurring_rules.payment_method, '')
           )",
        [],
    )
    .map_err(|err| format!("Could not infer recurring rule start dates: {err}"))?;
    conn.execute(
        "UPDATE recurring_rules SET start_date = next_date WHERE start_date IS NULL OR start_date = ''",
        [],
    )
    .map_err(|err| format!("Could not backfill recurring rule start dates: {err}"))?;
    Ok(())
}

fn ensure_recurring_discarded_dates(conn: &Connection) -> CmdResult<()> {
    let mut stmt = conn
        .prepare("PRAGMA table_info(recurring_rules)")
        .map_err(|err| format!("Could not inspect recurring rules schema: {err}"))?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|err| format!("Could not read recurring rules schema: {err}"))?;
    let mut has_discarded_dates = false;
    for column in columns {
        if column.map_err(|err| format!("Could not map recurring rules schema: {err}"))? == "discarded_dates" {
            has_discarded_dates = true;
            break;
        }
    }
    drop(stmt);
    if !has_discarded_dates {
        conn.execute(
            "ALTER TABLE recurring_rules ADD COLUMN discarded_dates TEXT NOT NULL DEFAULT '[]'",
            [],
        )
        .map_err(|err| format!("Could not add recurring rule discarded dates: {err}"))?;
    }
    Ok(())
}

fn seed_default_categories(conn: &Connection) -> CmdResult<()> {
    for category in default_categories() {
        conn.execute(
            "INSERT INTO categories(id, name, color, icon, sort_order, is_default)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                category.id,
                category.name,
                category.color,
                category.icon,
                category.sort_order,
                if category.is_default { 1 } else { 0 }
            ],
        )
        .map_err(|err| format!("Could not seed categories: {err}"))?;
    }
    Ok(())
}

fn load_profile_data(conn: &Connection) -> CmdResult<ProfileData> {
    Ok(ProfileData {
        categories: read_categories(conn)?,
        expenses: read_expenses(conn)?,
        budgets: read_budgets(conn)?,
        recurring_rules: read_recurring_rules(conn)?,
        app_settings: read_app_settings(conn)?,
        ai_settings: read_ai_settings(conn)?,
    })
}

fn persist_profile_data(conn: &mut Connection, data: &ProfileData) -> CmdResult<()> {
    let tx = conn
        .transaction()
        .map_err(|err| format!("Could not begin database transaction: {err}"))?;

    tx.execute("DELETE FROM expenses", [])
        .map_err(|err| format!("Could not clear expenses: {err}"))?;
    tx.execute("DELETE FROM budgets", [])
        .map_err(|err| format!("Could not clear budgets: {err}"))?;
    tx.execute("DELETE FROM recurring_rules", [])
        .map_err(|err| format!("Could not clear recurring rules: {err}"))?;
    tx.execute("DELETE FROM categories", [])
        .map_err(|err| format!("Could not clear categories: {err}"))?;
    tx.execute("DELETE FROM app_settings", [])
        .map_err(|err| format!("Could not clear app settings: {err}"))?;
    tx.execute("DELETE FROM ai_settings", [])
        .map_err(|err| format!("Could not clear AI settings: {err}"))?;

    for category in &data.categories {
        tx.execute(
            "INSERT INTO categories(id, name, color, icon, sort_order, is_default)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                category.id,
                category.name,
                category.color,
                category.icon,
                category.sort_order,
                if category.is_default { 1 } else { 0 }
            ],
        )
        .map_err(|err| format!("Could not save categories: {err}"))?;
    }

    for expense in &data.expenses {
        tx.execute(
            "INSERT INTO expenses(id, amount, currency, base_amount, base_currency, exchange_rate, exchange_rate_date, exchange_rate_source, date, category_id, title, remark, payment_method, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                expense.id,
                expense.amount,
                expense.currency,
                expense.base_amount,
                expense.base_currency,
                expense.exchange_rate,
                expense.exchange_rate_date,
                expense.exchange_rate_source,
                expense.date,
                expense.category_id,
                expense.title,
                expense.remark,
                expense.payment_method,
                expense.created_at,
                expense.updated_at
            ],
        )
        .map_err(|err| format!("Could not save expenses: {err}"))?;
    }

    for budget in &data.budgets {
        tx.execute(
            "INSERT INTO budgets(id, month, category_id, amount) VALUES (?1, ?2, ?3, ?4)",
            params![budget.id, budget.month, budget.category_id, budget.amount],
        )
        .map_err(|err| format!("Could not save budgets: {err}"))?;
    }

    for rule in &data.recurring_rules {
        let discarded_dates = serde_json::to_string(&rule.discarded_dates)
            .map_err(|err| format!("Could not serialize recurring rule discarded dates: {err}"))?;
        tx.execute(
            "INSERT INTO recurring_rules(id, title, amount, currency, category_id, remark, payment_method, cadence, day_of_month, start_date, next_date, discarded_dates, is_active, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                rule.id,
                rule.title,
                rule.amount,
                rule.currency,
                rule.category_id,
                rule.remark,
                rule.payment_method,
                rule.cadence,
                rule.day_of_month,
                rule.start_date,
                rule.next_date,
                discarded_dates,
                if rule.is_active { 1 } else { 0 },
                rule.created_at,
                rule.updated_at
            ],
        )
        .map_err(|err| format!("Could not save recurring rules: {err}"))?;
    }

    write_app_settings(&tx, &data.app_settings)?;
    write_ai_settings(&tx, &data.ai_settings)?;

    tx.commit()
        .map_err(|err| format!("Could not commit database changes: {err}"))?;
    Ok(())
}

fn read_categories(conn: &Connection) -> CmdResult<Vec<Category>> {
    let mut stmt = conn
        .prepare("SELECT id, name, color, icon, sort_order, is_default FROM categories ORDER BY sort_order, name")
        .map_err(|err| format!("Could not prepare categories query: {err}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Category {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                icon: row.get(3)?,
                sort_order: row.get(4)?,
                is_default: row.get::<_, i64>(5)? != 0,
            })
        })
        .map_err(|err| format!("Could not read categories: {err}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("Could not map categories: {err}"))
}

fn read_expenses(conn: &Connection) -> CmdResult<Vec<Expense>> {
    let mut stmt = conn
        .prepare(
            "SELECT id, amount, currency, COALESCE(base_amount, amount), COALESCE(base_currency, currency), COALESCE(exchange_rate, 1), COALESCE(exchange_rate_date, date), COALESCE(exchange_rate_source, 'legacy'), date, category_id, title, remark, payment_method, created_at, updated_at
             FROM expenses ORDER BY date DESC, created_at DESC",
        )
        .map_err(|err| format!("Could not prepare expenses query: {err}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Expense {
                id: row.get(0)?,
                amount: row.get(1)?,
                currency: row.get(2)?,
                base_amount: row.get(3)?,
                base_currency: row.get(4)?,
                exchange_rate: row.get(5)?,
                exchange_rate_date: row.get(6)?,
                exchange_rate_source: row.get(7)?,
                date: row.get(8)?,
                category_id: row.get(9)?,
                title: row.get(10)?,
                remark: row.get(11)?,
                payment_method: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
            })
        })
        .map_err(|err| format!("Could not read expenses: {err}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("Could not map expenses: {err}"))
}

fn read_budgets(conn: &Connection) -> CmdResult<Vec<Budget>> {
    let mut stmt = conn
        .prepare("SELECT id, month, category_id, amount FROM budgets ORDER BY month DESC")
        .map_err(|err| format!("Could not prepare budgets query: {err}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Budget {
                id: row.get(0)?,
                month: row.get(1)?,
                category_id: row.get(2)?,
                amount: row.get(3)?,
            })
        })
        .map_err(|err| format!("Could not read budgets: {err}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("Could not map budgets: {err}"))
}

fn read_recurring_rules(conn: &Connection) -> CmdResult<Vec<RecurringRule>> {
    let mut stmt = conn
        .prepare(
            "SELECT id, title, amount, currency, category_id, remark, payment_method, cadence, day_of_month, COALESCE(start_date, next_date), next_date, discarded_dates, is_active, created_at, updated_at
             FROM recurring_rules ORDER BY next_date, title",
        )
        .map_err(|err| format!("Could not prepare recurring rules query: {err}"))?;
    let rows = stmt
        .query_map([], |row| {
            let discarded_dates_json: String = row.get(11)?;
            Ok(RecurringRule {
                id: row.get(0)?,
                title: row.get(1)?,
                amount: row.get(2)?,
                currency: row.get(3)?,
                category_id: row.get(4)?,
                remark: row.get(5)?,
                payment_method: row.get(6)?,
                cadence: row.get(7)?,
                day_of_month: row.get(8)?,
                start_date: row.get(9)?,
                next_date: row.get(10)?,
                discarded_dates: serde_json::from_str(&discarded_dates_json).unwrap_or_default(),
                is_active: row.get::<_, i64>(12)? != 0,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
            })
        })
        .map_err(|err| format!("Could not read recurring rules: {err}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("Could not map recurring rules: {err}"))
}

fn read_app_settings(conn: &Connection) -> CmdResult<AppSettings> {
    let currency = read_setting(conn, "currency")?.unwrap_or_else(|| "SGD".to_string());
    let enabled_currencies = read_setting(conn, "enabledCurrencies")?
        .and_then(|value| serde_json::from_str::<Vec<String>>(&value).ok())
        .map(|values| normalize_enabled_currencies(values, &currency))
        .unwrap_or_else(|| {
            let defaults = if currency == "SGD" {
                vec!["SGD".to_string(), "MYR".to_string()]
            } else {
                vec![currency.clone()]
            };
            normalize_enabled_currencies(defaults, &currency)
        });
    let theme = normalize_theme(&read_setting(conn, "theme")?.unwrap_or_else(|| "light".to_string()));
    let accent_color = read_setting(conn, "accentColor")?.unwrap_or_else(|| "#315fbd".to_string());
    let accent_palette = read_setting(conn, "accentPalette")?
        .and_then(|value| serde_json::from_str::<Vec<String>>(&value).ok())
        .map(normalize_accent_palette)
        .unwrap_or_else(default_accent_palette);
    let payment_methods = read_setting(conn, "paymentMethods")?
        .and_then(|value| serde_json::from_str::<Vec<String>>(&value).ok())
        .unwrap_or_else(default_payment_methods);
    let wallpapers = read_setting(conn, "wallpapers")?
        .and_then(|value| serde_json::from_str::<Vec<WallpaperImage>>(&value).ok())
        .map(trim_wallpapers)
        .unwrap_or_default();
    let active_wallpaper_id = read_setting(conn, "activeWallpaperId")?
        .and_then(|value| if value.is_empty() { None } else { Some(value) })
        .filter(|id| wallpapers.iter().any(|wallpaper| wallpaper.id == *id));
    let wallpaper_opacity = read_setting(conn, "wallpaperOpacity")?
        .and_then(|value| value.parse::<f64>().ok())
        .map(clamp_wallpaper_opacity)
        .unwrap_or(0.34);
    Ok(AppSettings {
        currency,
        enabled_currencies,
        theme,
        accent_color,
        accent_palette,
        payment_methods,
        wallpapers,
        active_wallpaper_id,
        wallpaper_opacity,
    })
}

fn read_setting(conn: &Connection, key: &str) -> CmdResult<Option<String>> {
    conn.query_row("SELECT value FROM app_settings WHERE key = ?1", params![key], |row| row.get(0))
        .optional()
        .map_err(|err| format!("Could not read setting {key}: {err}"))
}

fn write_app_settings(conn: &Connection, settings: &AppSettings) -> CmdResult<()> {
    conn.execute(
        "INSERT OR REPLACE INTO app_settings(key, value) VALUES ('currency', ?1)",
        params![settings.currency],
    )
    .map_err(|err| format!("Could not write currency setting: {err}"))?;
    conn.execute(
        "INSERT OR REPLACE INTO app_settings(key, value) VALUES ('enabledCurrencies', ?1)",
        params![serde_json::to_string(&normalize_enabled_currencies(settings.enabled_currencies.clone(), &settings.currency)).map_err(|err| err.to_string())?],
    )
    .map_err(|err| format!("Could not write enabled currencies: {err}"))?;
    conn.execute(
        "INSERT OR REPLACE INTO app_settings(key, value) VALUES ('theme', ?1)",
        params![settings.theme],
    )
    .map_err(|err| format!("Could not write theme setting: {err}"))?;
    conn.execute(
        "INSERT OR REPLACE INTO app_settings(key, value) VALUES ('accentColor', ?1)",
        params![settings.accent_color],
    )
    .map_err(|err| format!("Could not write accent color: {err}"))?;
    conn.execute(
        "INSERT OR REPLACE INTO app_settings(key, value) VALUES ('accentPalette', ?1)",
        params![serde_json::to_string(&normalize_accent_palette(settings.accent_palette.clone())).map_err(|err| err.to_string())?],
    )
    .map_err(|err| format!("Could not write accent palette: {err}"))?;
    conn.execute(
        "INSERT OR REPLACE INTO app_settings(key, value) VALUES ('paymentMethods', ?1)",
        params![serde_json::to_string(&settings.payment_methods).map_err(|err| err.to_string())?],
    )
    .map_err(|err| format!("Could not write payment methods: {err}"))?;
    conn.execute(
        "INSERT OR REPLACE INTO app_settings(key, value) VALUES ('wallpapers', ?1)",
        params![serde_json::to_string(&trim_wallpapers(settings.wallpapers.clone())).map_err(|err| err.to_string())?],
    )
    .map_err(|err| format!("Could not write wallpapers: {err}"))?;
    conn.execute(
        "INSERT OR REPLACE INTO app_settings(key, value) VALUES ('activeWallpaperId', ?1)",
        params![settings.active_wallpaper_id.clone().unwrap_or_default()],
    )
    .map_err(|err| format!("Could not write active wallpaper: {err}"))?;
    conn.execute(
        "INSERT OR REPLACE INTO app_settings(key, value) VALUES ('wallpaperOpacity', ?1)",
        params![clamp_wallpaper_opacity(settings.wallpaper_opacity).to_string()],
    )
    .map_err(|err| format!("Could not write wallpaper opacity: {err}"))?;
    Ok(())
}

fn read_ai_settings(conn: &Connection) -> CmdResult<AiSettings> {
    conn.query_row(
        "SELECT provider, base_url, model, timeout_ms, max_tokens, api_key_saved FROM ai_settings WHERE id = 'default'",
        [],
        |row| {
            Ok(AiSettings {
                provider: row.get(0)?,
                base_url: row.get(1)?,
                model: row.get(2)?,
                timeout_ms: row.get(3)?,
                max_tokens: row.get(4)?,
                api_key_saved: row.get::<_, i64>(5)? != 0,
            })
        },
    )
    .optional()
    .map_err(|err| format!("Could not read AI settings: {err}"))?
    .map_or_else(|| Ok(default_ai_settings()), Ok)
}

fn write_ai_settings(conn: &Connection, settings: &AiSettings) -> CmdResult<()> {
    conn.execute(
        "INSERT OR REPLACE INTO ai_settings(id, provider, base_url, model, timeout_ms, max_tokens, api_key_saved)
         VALUES ('default', ?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            settings.provider,
            settings.base_url,
            settings.model,
            settings.timeout_ms,
            settings.max_tokens,
            if settings.api_key_saved { 1 } else { 0 }
        ],
    )
    .map_err(|err| format!("Could not write AI settings: {err}"))?;
    Ok(())
}

fn default_profile_data() -> ProfileData {
    ProfileData {
        categories: default_categories(),
        expenses: Vec::new(),
        budgets: Vec::new(),
        recurring_rules: Vec::new(),
        app_settings: default_app_settings(),
        ai_settings: default_ai_settings(),
    }
}

fn default_app_settings() -> AppSettings {
    AppSettings {
        currency: "SGD".to_string(),
        enabled_currencies: vec!["SGD".to_string(), "MYR".to_string()],
        theme: "light".to_string(),
        accent_color: "#315fbd".to_string(),
        accent_palette: default_accent_palette(),
        payment_methods: default_payment_methods(),
        wallpapers: Vec::new(),
        active_wallpaper_id: None,
        wallpaper_opacity: 0.34,
    }
}

fn normalize_enabled_currencies(currencies: Vec<String>, base_currency: &str) -> Vec<String> {
    let base = base_currency.trim().to_uppercase();
    let mut values = vec![base.clone()];
    for currency in currencies {
        let normalized = currency.trim().to_uppercase();
        if normalized.len() == 3
            && normalized.chars().all(|char| char.is_ascii_alphabetic())
            && !values.contains(&normalized)
        {
            values.push(normalized);
        }
    }
    values
}

fn default_accent_palette() -> Vec<String> {
    vec!["#2f5f8f", "#5d8b68", "#347f82", "#565d66", "#b76e79", "#725d8e"]
        .into_iter()
        .map(String::from)
        .collect()
}

fn normalize_accent_palette(colors: Vec<String>) -> Vec<String> {
    let mut palette: Vec<String> = Vec::new();
    for color in colors {
        let normalized = color.trim().to_lowercase();
        let is_hex = normalized.len() == 7
            && normalized.starts_with('#')
            && normalized.chars().skip(1).all(|char| char.is_ascii_hexdigit());
        if is_hex && !palette.contains(&normalized) {
            palette.push(normalized);
        }
        if palette.len() >= 6 {
            break;
        }
    }
    if palette.is_empty() {
        default_accent_palette()
    } else {
        palette
    }
}

fn trim_wallpapers(wallpapers: Vec<WallpaperImage>) -> Vec<WallpaperImage> {
    wallpapers.into_iter().take(5).collect()
}

fn clamp_wallpaper_opacity(value: f64) -> f64 {
    if !value.is_finite() {
        return 0.34;
    }
    value.clamp(0.12, 0.55)
}

fn normalize_theme(theme: &str) -> String {
    match theme {
        "dark" => "dark".to_string(),
        _ => "light".to_string(),
    }
}

fn default_ai_settings() -> AiSettings {
    AiSettings {
        provider: "none".to_string(),
        base_url: None,
        model: None,
        timeout_ms: 10000,
        max_tokens: 450,
        api_key_saved: false,
    }
}

fn default_payment_methods() -> Vec<String> {
    [
        "PayNow",
        "PayLah",
        "Apple Pay",
        "Credit Card",
        "Debit Card",
        "Bank Transfer",
        "Cash",
        "Other",
    ]
    .iter()
    .map(|value| value.to_string())
    .collect()
}

fn default_categories() -> Vec<Category> {
    let names = [
        ("cat_food_drinks", "Food & Drinks", "#ec7a5c"),
        ("cat_transport", "Transport", "#4f8fcf"),
        ("cat_groceries", "Groceries", "#53a86b"),
        ("cat_shopping", "Shopping", "#c27ac9"),
        ("cat_household", "Household", "#b89b49"),
        ("cat_school_work", "School / Work", "#5d8f86"),
        ("cat_entertainment", "Entertainment", "#e0a23b"),
        ("cat_health", "Health", "#d45f75"),
        ("cat_travel", "Travel", "#4aa6b5"),
        ("cat_bills", "Bills", "#8175cc"),
        ("cat_rent_housing", "Rent / Housing", "#9a7d5a"),
        ("cat_gifts", "Gifts", "#ef8bc2"),
        ("cat_transfer", "Transfer", "#79808a"),
        ("cat_other", "Other", "#8a98a8"),
    ];

    names
        .iter()
        .enumerate()
        .map(|(index, (id, name, color))| Category {
            id: id.to_string(),
            name: name.to_string(),
            color: color.to_string(),
            icon: None,
            sort_order: index as i64,
            is_default: true,
        })
        .collect()
}

fn next_profile_color(index: usize) -> String {
    let colors = ["#4466d4", "#3a9a6f", "#c36a4d", "#8a66bf", "#2f8f9d", "#b98b28"];
    colors[index % colors.len()].to_string()
}

fn sanitize_file_name(file_name: &str) -> String {
    let cleaned: String = file_name
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
                ch
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches('_');
    if trimmed.is_empty() {
        "localspend-file".to_string()
    } else {
        trimmed.to_string()
    }
}

#[allow(dead_code)]
fn ensure_parent(path: &Path) -> CmdResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("Could not create parent directory: {err}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initializes_sqlite_schema_and_defaults() {
        let conn = Connection::open_in_memory().expect("in-memory sqlite");
        initialize_database(&conn).expect("database init");
        let data = load_profile_data(&conn).expect("profile data");
        assert_eq!(data.categories.len(), 14);
        assert_eq!(data.app_settings.currency, "SGD");
        assert_eq!(data.app_settings.accent_color, "#315fbd");
        assert_eq!(data.app_settings.accent_palette.len(), 6);
        assert_eq!(data.ai_settings.provider, "none");
    }

    #[test]
    fn persists_profile_payload_without_cross_table_loss() {
        let mut conn = Connection::open_in_memory().expect("in-memory sqlite");
        initialize_database(&conn).expect("database init");
        let mut data = load_profile_data(&conn).expect("profile data");
        data.expenses.push(Expense {
            id: "exp_test".to_string(),
            amount: 12.50,
            currency: "SGD".to_string(),
            base_amount: 12.50,
            base_currency: "SGD".to_string(),
            exchange_rate: 1.0,
            exchange_rate_date: "2026-07-07".to_string(),
            exchange_rate_source: "base".to_string(),
            date: "2026-07-07".to_string(),
            category_id: data.categories[0].id.clone(),
            title: Some("Lunch".to_string()),
            remark: None,
            payment_method: Some("PayNow".to_string()),
            created_at: "2026-07-07T00:00:00Z".to_string(),
            updated_at: "2026-07-07T00:00:00Z".to_string(),
        });
        data.recurring_rules.push(RecurringRule {
            id: "rule_test".to_string(),
            title: "Phone bill".to_string(),
            amount: 20.0,
            currency: "SGD".to_string(),
            category_id: data.categories[0].id.clone(),
            remark: None,
            payment_method: Some("PayNow".to_string()),
            cadence: "monthly".to_string(),
            day_of_month: Some(5),
            start_date: "2026-06-05".to_string(),
            next_date: "2026-07-05".to_string(),
            discarded_dates: vec!["2026-06-05".to_string()],
            is_active: true,
            created_at: "2026-06-01T00:00:00Z".to_string(),
            updated_at: "2026-07-07T00:00:00Z".to_string(),
        });
        persist_profile_data(&mut conn, &data).expect("save data");
        let loaded = load_profile_data(&conn).expect("reload data");
        assert_eq!(loaded.expenses.len(), 1);
        assert_eq!(loaded.expenses[0].title.as_deref(), Some("Lunch"));
        assert_eq!(loaded.categories.len(), 14);
        assert_eq!(loaded.recurring_rules[0].discarded_dates, vec!["2026-06-05"]);
    }

    #[test]
    fn migrates_legacy_expenses_to_stable_base_currency_snapshots() {
        let conn = Connection::open_in_memory().expect("in-memory sqlite");
        conn.execute_batch(
            "CREATE TABLE expenses (
               id TEXT PRIMARY KEY,
               amount REAL NOT NULL,
               currency TEXT NOT NULL,
               date TEXT NOT NULL,
               category_id TEXT NOT NULL,
               title TEXT,
               remark TEXT,
               payment_method TEXT,
               created_at TEXT NOT NULL,
               updated_at TEXT NOT NULL
             );
             CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             INSERT INTO app_settings(key, value) VALUES ('currency', 'SGD');
             INSERT INTO expenses(id, amount, currency, date, category_id, title, created_at, updated_at)
             VALUES ('legacy', 8.50, 'SGD', '2026-07-01', 'cat_food_drinks', 'Lunch', '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z');",
        )
        .expect("legacy schema");

        initialize_database(&conn).expect("database migration");
        let expenses = read_expenses(&conn).expect("migrated expenses");
        assert_eq!(expenses[0].base_amount, 8.50);
        assert_eq!(expenses[0].base_currency, "SGD");
        assert_eq!(expenses[0].exchange_rate, 1.0);
        assert_eq!(expenses[0].exchange_rate_source, "base");
    }
}
