# db_utils.py
"""
Shared DB helper functions used by both Admin and User UIs.
Connection settings come from environment variables (see legacy/README.md):
VAMUSIC_DB_HOST, VAMUSIC_DB_PORT, VAMUSIC_DB_USER, VAMUSIC_DB_PASSWORD, VAMUSIC_DB_NAME.
"""

import os

import mysql.connector
import bcrypt
from tkinter import messagebox

DB_CONFIG = {
    "host": os.environ.get("VAMUSIC_DB_HOST", "localhost"),
    "port": int(os.environ.get("VAMUSIC_DB_PORT", "3306")),
    "user": os.environ.get("VAMUSIC_DB_USER", "root"),
    "password": os.environ.get("VAMUSIC_DB_PASSWORD", ""),
    "database": os.environ.get("VAMUSIC_DB_NAME", "vamusic"),
    "raise_on_warnings": True,
    "autocommit": True
}

def get_db_connection():
    """Return a new DB connection using DB_CONFIG."""
    try:
        return mysql.connector.connect(**DB_CONFIG)
    except mysql.connector.Error as err:
        # Use messagebox only if GUI present; otherwise raise
        try:
            messagebox.showerror("DB Error", f"Cannot connect to DB: {err}")
        except Exception:
            pass
        raise

def safe_execute(query, params=None, fetch=False):
    """
    Execute a query.
    - fetch=False returns None
    - fetch=True returns list[dict] (cursor dictionary=True)
    """
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute(query, params or ())
        if fetch:
            return cur.fetchall()
        else:
            conn.commit()
            return None
    finally:
        cur.close()
        conn.close()

def call_procedure(proc_name, params=None):
    """
    Call a stored procedure and return results.
    Returns list[dict] of the first result set.
    """
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        # Build the call statement: CALL proc_name(?, ?, ...)
        placeholders = ','.join(['%s'] * (len(params) if params else 0))
        call_stmt = f"CALL {proc_name}({placeholders})"
        cur.execute(call_stmt, params or ())
        results = cur.fetchall()
        return results
    finally:
        cur.close()
        conn.close()

def hash_password(plain_pw: str) -> str:
    """Return bcrypt-hashed password (utf-8 str)."""
    return bcrypt.hashpw(plain_pw.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_pw: str, hashed: str) -> bool:
    """Verify a plain password against bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_pw.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False
