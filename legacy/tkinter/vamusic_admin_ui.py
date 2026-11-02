# vamusic_admin_ui.py
"""
Admin UI for VaMusic.
Requires: db_utils.py, sql_script.py, mysql-connector-python, bcrypt
Features:
 - Test DB connection
 - Import SQL script (defaults to ../mysql/vamusic_v2.sql)
 - CRUD for Users, Artists, Albums, Tracks, Playlists (basic)
 - Uses db_utils.safe_execute for DB ops
"""

import os
import tkinter as tk
from tkinter import ttk, messagebox, filedialog
from db_utils import DB_CONFIG, safe_execute, get_db_connection, hash_password
from sql_script import split_mysql_script
import mysql.connector

# Default schema to import: the project's own MySQL script
SQL_FILE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "mysql", "vamusic_v2.sql")

# ---------- Helpers ----------
def run_sql_file(path):
    """
    Execute every statement in a MySQL script, honouring DELIMITER blocks.
    Connects without a default database so DROP/CREATE DATABASE can run.
    Returns the number of statements executed; raises RuntimeError listing any failures.
    """
    cfg = DB_CONFIG.copy()
    cfg.pop("database", None)
    cfg["raise_on_warnings"] = False
    with open(path, 'r', encoding='utf-8') as f:
        statements = split_mysql_script(f.read())
    conn = mysql.connector.connect(**cfg)
    cur = conn.cursor()
    errors = []
    try:
        for i, st in enumerate(statements, 1):
            try:
                cur.execute(st)
                if cur.with_rows:
                    cur.fetchall()
            except mysql.connector.Error as e:
                errors.append(f"#{i}: {e.msg} -- {st[:60]!r}")
        conn.commit()
    finally:
        cur.close()
        conn.close()
    if errors:
        summary = f"{len(errors)} of {len(statements)} statements failed:"
        raise RuntimeError("\n".join([summary, *errors[:10]]))
    return len(statements)

# ---------- GUI ----------
class AdminApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("VaMusic - Admin")
        self.geometry("1100x700")
        self._build_ui()

    def _build_ui(self):
        top = ttk.Frame(self)
        top.pack(fill='x', padx=8, pady=6)

        ttk.Label(top, text="VaMusic Admin Panel", font=("Segoe UI", 14)).pack(side='left')

        ttk.Button(top, text="Test DB", command=self.test_db).pack(side='right', padx=4)
        ttk.Button(top, text="Import SQL", command=self.do_import_sql).pack(side='right')

        self.nb = ttk.Notebook(self)
        self.nb.pack(fill='both', expand=True, padx=8, pady=8)

        # Tabs
        self.users_tab = AdminUsersTab(self.nb)
        self.artists_tab = AdminArtistsTab(self.nb)
        self.albums_tab = AdminAlbumsTab(self.nb)
        self.tracks_tab = AdminTracksTab(self.nb)
        self.playlists_tab = AdminPlaylistsTab(self.nb)

        for w, title in [
            (self.users_tab, "Users"),
            (self.artists_tab, "Artists"),
            (self.albums_tab, "Albums"),
            (self.tracks_tab, "Tracks"),
            (self.playlists_tab, "Playlists"),
        ]:
            self.nb.add(w, text=title)

    def test_db(self):
        try:
            conn = get_db_connection()
            conn.close()
            messagebox.showinfo("DB", "Connection OK")
        except Exception as e:
            messagebox.showerror("DB Error", f"Connection failed: {e}")

    def do_import_sql(self):
        path = filedialog.askopenfilename(initialdir=os.path.dirname(SQL_FILE_PATH), title="Select SQL file",
                                          filetypes=[("SQL files", "*.sql"), ("All files", "*.*")])
        if not path:
            return
        if not messagebox.askyesno("Import SQL", f"Run SQL script: {path}? This may DROP/CREATE databases. Continue?"):
            return
        try:
            count = run_sql_file(path)
            messagebox.showinfo("Import SQL", f"Executed {count} statements successfully.")
        except Exception as e:
            messagebox.showerror("Import Error", str(e))

# ---------- Admin Tabs (concise implementations) ----------
def build_tree(parent, cols):
    tv = ttk.Treeview(parent, columns=cols, show='headings')
    for c in cols:
        tv.heading(c, text=c)
        tv.column(c, width=130)
    return tv

class AdminUsersTab(ttk.Frame):
    def __init__(self, parent):
        super().__init__(parent)
        left = ttk.Frame(self); left.pack(side='left', fill='y', padx=6, pady=6)
        right = ttk.Frame(self); right.pack(side='right', fill='both', expand=True, padx=6, pady=6)

        ttk.Label(left, text="User Form").pack(pady=4)
        self.entries = {}
        for label in ("username", "email", "password", "first_name", "last_name"):
            ttk.Label(left, text=label.title()).pack(anchor='w')
            e = ttk.Entry(left)
            e.pack(fill='x', pady=2)
            self.entries[label] = e

        ttk.Button(left, text="Add", command=self.add).pack(fill='x', pady=4)
        ttk.Button(left, text="Update", command=self.update).pack(fill='x', pady=2)
        ttk.Button(left, text="Delete", command=self.delete).pack(fill='x', pady=2)
        ttk.Button(left, text="Refresh", command=self.load).pack(fill='x', pady=2)

        cols = ("user_id", "username", "email", "first_name", "last_name", "created_at")
        self.tv = build_tree(right, cols)
        self.tv.pack(fill='both', expand=True)
        self.tv.bind("<<TreeviewSelect>>", self.on_select)
        self.load()

    def load(self):
        rows = safe_execute("SELECT user_id, username, email, first_name, last_name, created_at FROM User", fetch=True) or []
        for r in self.tv.get_children(): self.tv.delete(r)
        for row in rows: self.tv.insert("", "end", values=(row['user_id'], row['username'], row['email'], row['first_name'], row['last_name'], row['created_at']))

    def add(self):
        u = self.entries['username'].get().strip()
        e = self.entries['email'].get().strip()
        p = self.entries['password'].get().strip()
        if not (u and e and p):
            messagebox.showwarning("Validation", "username, email, password required.")
            return
        pw = hash_password(p)
        try:
            safe_execute("INSERT INTO User (username, email, password, first_name, last_name) VALUES (%s,%s,%s,%s,%s)", (u,e,pw,self.entries['first_name'].get().strip(), self.entries['last_name'].get().strip()))
            messagebox.showinfo("Added", "User added.")
            self.load()
        except Exception as ex:
            messagebox.showerror("Error", str(ex))

    def on_select(self, _):
        sel = self.tv.selection()
        if not sel: return
        uid = self.tv.item(sel[0], 'values')[0]
        row = safe_execute("SELECT * FROM User WHERE user_id=%s", (uid,), fetch=True)
        if not row: return
        row = row[0]
        for k in ('username','email','first_name','last_name'):
            self.entries[k].delete(0,'end'); self.entries[k].insert(0, row.get(k) or '')
        self.entries['password'].delete(0,'end')

    def update(self):
        sel = self.tv.selection()
        if not sel:
            messagebox.showwarning("Select", "Select a user first")
            return
        uid = self.tv.item(sel[0], 'values')[0]
        u = self.entries['username'].get().strip(); e = self.entries['email'].get().strip()
        p = self.entries['password'].get().strip()
        if p:
            pw = hash_password(p)
            safe_execute("UPDATE User SET username=%s, email=%s, password=%s, first_name=%s, last_name=%s WHERE user_id=%s", (u,e,pw,self.entries['first_name'].get().strip(), self.entries['last_name'].get().strip(), uid))
        else:
            safe_execute("UPDATE User SET username=%s, email=%s, first_name=%s, last_name=%s WHERE user_id=%s", (u,e,self.entries['first_name'].get().strip(), self.entries['last_name'].get().strip(), uid))
        messagebox.showinfo("Updated", "User updated.")
        self.load()

    def delete(self):
        sel = self.tv.selection()
        if not sel: messagebox.showwarning("Select", "Select user"); return
        uid = self.tv.item(sel[0], 'values')[0]
        if messagebox.askyesno("Confirm", "Delete user?"):
            safe_execute("DELETE FROM User WHERE user_id=%s", (uid,))
            messagebox.showinfo("Deleted", "User deleted.")
            self.load()

class AdminArtistsTab(ttk.Frame):
    def __init__(self, parent):
        super().__init__(parent)
        left = ttk.Frame(self); left.pack(side='left', fill='y', padx=6, pady=6)
        right = ttk.Frame(self); right.pack(side='right', fill='both', expand=True, padx=6, pady=6)

        ttk.Label(left, text="Artist").pack()
        self.name = ttk.Entry(left); self.name.pack(fill='x', pady=2)
        self.bio = ttk.Entry(left); self.bio.pack(fill='x', pady=2)
        ttk.Button(left, text="Add", command=self.add).pack(fill='x', pady=2)
        ttk.Button(left, text="Update", command=self.update).pack(fill='x', pady=2)
        ttk.Button(left, text="Delete", command=self.delete).pack(fill='x', pady=2)
        ttk.Button(left, text="Refresh", command=self.load).pack(fill='x')

        cols = ("artist_id","artist_name","country","is_verified","monthly_listeners","created_at")
        self.tv = build_tree(right, cols); self.tv.pack(fill='both', expand=True); self.tv.bind("<<TreeviewSelect>>", self.on_select)
        self.load()

    def load(self):
        rows = safe_execute("SELECT artist_id, artist_name, country, is_verified, monthly_listeners, created_at FROM Artist", fetch=True) or []
        for r in self.tv.get_children(): self.tv.delete(r)
        for row in rows: self.tv.insert("", "end", values=(row['artist_id'], row['artist_name'], row['country'], row['is_verified'], row['monthly_listeners'], row['created_at']))

    def add(self):
        if not self.name.get().strip(): messagebox.showwarning("Validation","Name required"); return
        safe_execute("INSERT INTO Artist (artist_name, bio) VALUES (%s,%s)", (self.name.get().strip(), self.bio.get().strip() or None))
        messagebox.showinfo("Added","Artist added"); self.load()

    def on_select(self, _):
        sel = self.tv.selection()
        if not sel: return
        aid = self.tv.item(sel[0],'values')[0]
        row = safe_execute("SELECT * FROM Artist WHERE artist_id=%s", (aid,), fetch=True)[0]
        self.name.delete(0,'end'); self.name.insert(0, row.get('artist_name') or '')
        self.bio.delete(0,'end'); self.bio.insert(0, row.get('bio') or '')

    def update(self):
        sel = self.tv.selection(); 
        if not sel: messagebox.showwarning("Select","Select artist"); return
        aid = self.tv.item(sel[0],'values')[0]
        safe_execute("UPDATE Artist SET artist_name=%s, bio=%s WHERE artist_id=%s", (self.name.get().strip(), self.bio.get().strip() or None, aid))
        messagebox.showinfo("Updated","Artist updated"); self.load()

    def delete(self):
        sel = self.tv.selection()
        if not sel: messagebox.showwarning("Select","Select artist"); return
        aid = self.tv.item(sel[0],'values')[0]
        if messagebox.askyesno("Confirm","Delete artist? This may cascade."):
            safe_execute("DELETE FROM Artist WHERE artist_id=%s", (aid,))
            messagebox.showinfo("Deleted","Artist deleted"); self.load()

class AdminAlbumsTab(ttk.Frame):
    def __init__(self, parent):
        super().__init__(parent)
        frm = ttk.Frame(self); frm.pack(fill='x', padx=6, pady=6)
        ttk.Label(frm, text="Title").grid(row=0,column=0); self.title_e = ttk.Entry(frm); self.title_e.grid(row=0,column=1,sticky='ew')
        ttk.Label(frm, text="Artist ID").grid(row=1,column=0); self.artist_e = ttk.Entry(frm); self.artist_e.grid(row=1,column=1,sticky='ew')
        ttk.Button(frm, text="Add", command=self.add).grid(row=2,column=0,columnspan=2,pady=4)
        ttk.Button(frm, text="Refresh", command=self.load).grid(row=0,column=2,padx=6)

        cols=("album_id","album_title","artist_id","release_date","total_tracks")
        self.tv = build_tree(self, cols); self.tv.pack(fill='both', expand=True, padx=6, pady=6); self.tv.bind("<<TreeviewSelect>>", self.on_select)
        self.load()

    def load(self):
        rows = safe_execute("SELECT album_id, album_title, artist_id, release_date, total_tracks FROM Album", fetch=True) or []
        for r in self.tv.get_children(): self.tv.delete(r)
        for row in rows: self.tv.insert("", "end", values=(row['album_id'], row['album_title'], row['artist_id'], row['release_date'], row.get('total_tracks')))

    def add(self):
        if not (self.title_e.get().strip() and self.artist_e.get().strip()):
            messagebox.showwarning("Validation","Title and Artist ID required"); return
        safe_execute("INSERT INTO Album (album_title, artist_id) VALUES (%s,%s)", (self.title_e.get().strip(), int(self.artist_e.get().strip())))
        messagebox.showinfo("Added","Album added"); self.load()

    def on_select(self, _):
        sel = self.tv.selection(); 
        if not sel: return
        row = self.tv.item(sel[0],'values')
        self.title_e.delete(0,'end'); self.title_e.insert(0, row[1])
        self.artist_e.delete(0,'end'); self.artist_e.insert(0, row[2])

class AdminTracksTab(ttk.Frame):
    def __init__(self, parent):
        super().__init__(parent)
        frm = ttk.Frame(self); frm.pack(fill='x', padx=6, pady=6)
        ttk.Label(frm, text="Title").grid(row=0,column=0); self.t_title = ttk.Entry(frm); self.t_title.grid(row=0,column=1,sticky='ew')
        ttk.Label(frm, text="Album ID").grid(row=1,column=0); self.t_album = ttk.Entry(frm); self.t_album.grid(row=1,column=1,sticky='ew')
        ttk.Label(frm, text="Duration (s)").grid(row=2,column=0); self.t_dur = ttk.Entry(frm); self.t_dur.grid(row=2,column=1,sticky='ew')
        ttk.Button(frm, text="Add", command=self.add).grid(row=3,column=0,columnspan=2,pady=4)
        ttk.Button(frm, text="Refresh", command=self.load).grid(row=0,column=2,padx=6)

        cols=("track_id","track_title","album_id","duration_seconds","play_count")
        self.tv = build_tree(self, cols); self.tv.pack(fill='both', expand=True, padx=6, pady=6); self.tv.bind("<<TreeviewSelect>>", self.on_select)
        self.load()

    def load(self):
        rows = safe_execute("SELECT track_id, track_title, album_id, duration_seconds, play_count FROM Track", fetch=True) or []
        for r in self.tv.get_children(): self.tv.delete(r)
        for row in rows: self.tv.insert("", "end", values=(row['track_id'], row['track_title'], row['album_id'], row.get('duration_seconds'), row.get('play_count')))

    def add(self):
        if not (self.t_title.get().strip() and self.t_album.get().strip() and self.t_dur.get().strip()):
            messagebox.showwarning("Validation","Title, Album ID and Duration required"); return
        safe_execute("INSERT INTO Track (track_title, album_id, duration_seconds) VALUES (%s,%s,%s)", (self.t_title.get().strip(), int(self.t_album.get().strip()), int(self.t_dur.get().strip())))
        messagebox.showinfo("Added","Track added"); self.load()

    def on_select(self, _):
        sel = self.tv.selection(); 
        if not sel: return
        vals = self.tv.item(sel[0],'values')
        self.t_title.delete(0,'end'); self.t_title.insert(0, vals[1])
        self.t_album.delete(0,'end'); self.t_album.insert(0, vals[2])
        self.t_dur.delete(0,'end'); self.t_dur.insert(0, vals[3])

class AdminPlaylistsTab(ttk.Frame):
    def __init__(self, parent):
        super().__init__(parent)
        left = ttk.Frame(self); left.pack(side='left', fill='y', padx=6, pady=6)
        right = ttk.Frame(self); right.pack(side='right', fill='both', expand=True, padx=6, pady=6)

        ttk.Label(left, text="Create Playlist").pack()
        self.pname = ttk.Entry(left); self.pname.pack(fill='x', pady=4)
        self.puser = ttk.Entry(left); ttk.Label(left, text="created_by (user_id)").pack(); self.puser.pack(fill='x', pady=4)
        ttk.Button(left, text="Create", command=self.create).pack(fill='x', pady=2)
        ttk.Button(left, text="Refresh", command=self.load).pack(fill='x')

        cols=("playlist_id","playlist_name","created_by","is_public","follower_count","created_at")
        self.tv = build_tree(right, cols); self.tv.pack(fill='both', expand=True); self.tv.bind("<<TreeviewSelect>>", self.on_select)
        self.load()

    def load(self):
        rows = safe_execute("SELECT playlist_id, playlist_name, created_by, is_public, follower_count, created_at FROM Playlist", fetch=True) or []
        for r in self.tv.get_children(): self.tv.delete(r)
        for row in rows: self.tv.insert("", "end", values=(row['playlist_id'], row['playlist_name'], row['created_by'], row['is_public'], row['follower_count'], row['created_at']))

    def create(self):
        if not (self.pname.get().strip() and self.puser.get().strip()):
            messagebox.showwarning("Validation","Name and created_by required"); return
        safe_execute("INSERT INTO Playlist (playlist_name, created_by, is_public) VALUES (%s,%s,%s)", (self.pname.get().strip(), int(self.puser.get().strip()), True))
        messagebox.showinfo("Created","Playlist created"); self.load()

    def on_select(self, _):
        sel = self.tv.selection()
        if not sel: return
        vals = self.tv.item(sel[0],'values')
        self.pname.delete(0,'end'); self.pname.insert(0, vals[1])
        self.puser.delete(0,'end'); self.puser.insert(0, vals[2] or '')

# ---------- Run ----------
if __name__ == "__main__":
    app = AdminApp()
    app.mainloop()
