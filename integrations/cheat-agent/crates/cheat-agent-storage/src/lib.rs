use cheat_agent_core::{CheatError, Result};
use rusqlite::{params, Connection};
use std::sync::Mutex;

pub struct StorageManager {
    conn: Mutex<Connection>,
}

impl StorageManager {
    pub fn open(path: &str) -> Result<Self> {
        let conn = Connection::open(path).map_err(|e| CheatError::Internal(e.to_string()))?;
        let mgr = Self {
            conn: Mutex::new(conn),
        };
        mgr.init_tables()?;
        Ok(mgr)
    }

    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory().map_err(|e| CheatError::Internal(e.to_string()))?;
        let mgr = Self {
            conn: Mutex::new(conn),
        };
        mgr.init_tables()?;
        Ok(mgr)
    }

    fn init_tables(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                goal TEXT NOT NULL,
                target_name TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS scan_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                scan_type TEXT NOT NULL,
                candidate_count INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(session_id) REFERENCES sessions(id)
            );
            CREATE TABLE IF NOT EXISTS candidates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                address INTEGER NOT NULL,
                FOREIGN KEY(session_id) REFERENCES sessions(id)
            );
            CREATE TABLE IF NOT EXISTS verifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                status TEXT NOT NULL,
                report_json TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(session_id) REFERENCES sessions(id)
            );"
        ).map_err(|e| CheatError::Internal(e.to_string()))?;
        Ok(())
    }

    pub fn create_session(&self, goal: &str, target_name: &str) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO sessions (goal, target_name, status) VALUES (?1, ?2, 'running')",
            params![goal, target_name],
        ).map_err(|e| CheatError::Internal(e.to_string()))?;
        Ok(conn.last_insert_rowid())
    }

    pub fn record_scan(&self, session_id: i64, scan_type: &str, candidate_count: usize) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO scan_history (session_id, scan_type, candidate_count) VALUES (?1, ?2, ?3)",
            params![session_id, scan_type, candidate_count as i64],
        ).map_err(|e| CheatError::Internal(e.to_string()))?;
        Ok(())
    }

    pub fn record_candidates(&self, session_id: i64, addresses: &[u64]) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction().map_err(|e| CheatError::Internal(e.to_string()))?;
        {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO candidates (session_id, address) VALUES (?1, ?2)"
            ).map_err(|e| CheatError::Internal(e.to_string()))?;

            for addr in addresses {
                stmt.execute(params![session_id, *addr as i64])
                    .map_err(|e| CheatError::Internal(e.to_string()))?;
            }
        }
        tx.commit().map_err(|e| CheatError::Internal(e.to_string()))?;
        Ok(())
    }

    pub fn record_verification(&self, session_id: i64, status: &str, report_json: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO verifications (session_id, status, report_json) VALUES (?1, ?2, ?3)",
            params![session_id, status, report_json],
        ).map_err(|e| CheatError::Internal(e.to_string()))?;
        conn.execute(
            "UPDATE sessions SET status = ?1 WHERE id = ?2",
            params![status, session_id],
        ).map_err(|e| CheatError::Internal(e.to_string()))?;
        Ok(())
    }

    pub fn get_session_history(&self, session_id: i64) -> Result<Vec<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT scan_type || ': ' || candidate_count || ' candidates' FROM scan_history WHERE session_id = ?1 ORDER BY id ASC"
        ).map_err(|e| CheatError::Internal(e.to_string()))?;

        let rows = stmt.query_map(params![session_id], |row| row.get(0))
            .map_err(|e| CheatError::Internal(e.to_string()))?;

        let mut history = Vec::new();
        for r in rows {
            if let Ok(entry) = r {
                history.push(entry);
            }
        }
        Ok(history)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_storage_session_and_scans() {
        let storage = StorageManager::open_in_memory().unwrap();
        let sess_id = storage.create_session("infinite ammo", "game.exe").unwrap();
        assert!(sess_id > 0);

        storage.record_scan(sess_id, "exact:100", 250).unwrap();
        storage.record_scan(sess_id, "decreased", 1).unwrap();

        let history = storage.get_session_history(sess_id).unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0], "exact:100: 250 candidates");
        assert_eq!(history[1], "decreased: 1 candidates");
    }
}
