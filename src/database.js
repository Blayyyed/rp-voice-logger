// database.js
// Helper module to manage the local SQLite database for the RP Voice Logger.
// Uses expo-sqlite to open and execute queries. Tables are created on-demand.

import * as SQLite from 'expo-sqlite';

let db;

/**
 * Open (or create) the local SQLite database. Call this before any operations.
 */
export function openDatabase() {
  if (db) return db;
  db = SQLite.openDatabase('rp_voice_logger.db');
  return db;
}

/**
 * Initialise the database by creating necessary tables if they do not exist.
 */
export function initDatabase() {
  const database = openDatabase();
  // Wrap each table creation in its own transaction for clarity.
  database.transaction(tx => {
    // Sessions table: stores metadata for both dose and smear sessions.
    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        tech_initials TEXT,
        plant_unit TEXT,
        area TEXT,
        rwp_number TEXT,
        survey_type TEXT,
        instrument_ids TEXT,
        notes TEXT
      );`
    );
  });
  database.transaction(tx => {
    // Components table: optional library of plant components.
    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS components (
        component_id TEXT PRIMARY KEY NOT NULL,
        nickname TEXT,
        notes TEXT
      );`
    );
  });
  database.transaction(tx => {
    // Dose points table: stores dose rate measurements.
    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS dose_points (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL,
        component_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        reading_type TEXT NOT NULL, -- GA, contact, 30cm
        value REAL NOT NULL,
        unit TEXT NOT NULL, -- mrem/hr or R/hr
        audio_uri TEXT NOT NULL,
        transcript TEXT,
        status TEXT DEFAULT 'draft',
        FOREIGN KEY(session_id) REFERENCES sessions(session_id)
      );`
    );
  });
  database.transaction(tx => {
    // Smear sets table: defines a batch of smear samples.
    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS smear_sets (
        smear_set_id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL,
        created_time INTEGER NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(session_id)
      );`
    );
  });
  database.transaction(tx => {
    // Smear samples table: one row per smear.
    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS smear_samples (
        id TEXT PRIMARY KEY NOT NULL,
        smear_set_id TEXT NOT NULL,
        smear_number INTEGER NOT NULL,
        location_phrase TEXT NOT NULL,
        result_value REAL,
        result_unit TEXT,
        result_type TEXT, -- numeric, lessThan, overrange, direct
        follow_up REAL,
        follow_up_unit TEXT,
        audio_uri_collection TEXT,
        audio_uri_counting TEXT,
        status TEXT DEFAULT 'draft',
        FOREIGN KEY(smear_set_id) REFERENCES smear_sets(smear_set_id)
      );`
    );
  });
}

/**
 * Generic helper to run a SQL query with parameters and return a Promise.
 * @param {string} sql
 * @param {Array<any>} params
 * @returns {Promise<Array<any>>}
 */
export function executeSql(sql, params = []) {
  const database = openDatabase();
  return new Promise((resolve, reject) => {
    database.transaction(tx => {
      tx.executeSql(
        sql,
        params,
        (_, result) => resolve(result.rows._array ?? []),
        (_, error) => {
          console.error('SQL error:', error);
          reject(error);
          return false;
        }
      );
    });
  });
}

// Additional helper functions to insert and fetch domain objects could be added here.
