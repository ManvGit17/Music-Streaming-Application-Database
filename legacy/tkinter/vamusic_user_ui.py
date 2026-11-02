# vamusic_user_ui.py
"""
User UI for VaMusic.
Requires: db_utils.py, mysql-connector-python, bcrypt
Features:
 - Login/Register (bcrypt)
 - Browse/Search tracks
 - Like/Unlike tracks
 - Create & manage personal playlists (add/remove tracks)
 - View library (liked tracks, followed artists)
"""

import os
import tkinter as tk
from tkinter import ttk, messagebox, simpledialog
import webbrowser

import mysql.connector

from db_utils import safe_execute, call_procedure, hash_password, verify_password

class UserApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("VaMusic - User")
        self.geometry("1100x700")
        self.user = None
        self._build_ui()

    def _build_ui(self):
        top = ttk.Frame(self); top.pack(fill='x', padx=8, pady=6)
        self.lbl_user = ttk.Label(top, text="Not signed in", font=("Segoe UI", 12)); self.lbl_user.pack(side='left')
        ttk.Button(top, text="Login", command=self.login).pack(side='right')
        ttk.Button(top, text="Register", command=self.register).pack(side='right', padx=4)
        ttk.Button(top, text="Refresh", command=self.refresh_all).pack(side='right')

        self.nb = ttk.Notebook(self); self.nb.pack(fill='both', expand=True, padx=8, pady=8)
        self.browse_tab = BrowseTab(self.nb, self)
        self.playlists_tab = PlaylistsTab(self.nb, self)
        self.library_tab = LibraryTab(self.nb, self)
        self.profile_tab = ProfileTab(self.nb, self)

        for w,t in [(self.browse_tab,"Browse"), (self.playlists_tab,"Playlists"), (self.library_tab,"Library"), (self.profile_tab,"Profile")]:
            self.nb.add(w, text=t)

    def login(self):
        dlg = LoginDialog(self)
        self.wait_window(dlg)
        if not getattr(dlg, 'result', None): return
        username, password = dlg.result
        rows = safe_execute("SELECT * FROM User WHERE username=%s", (username,), fetch=True)
        if not rows:
            messagebox.showerror("Login", "No such user.")
            return
        user = rows[0]
        if verify_password(password, user['password']):
            self.user = user
            self.lbl_user.config(text=f"Signed in: {user['username']}")
            messagebox.showinfo("Welcome", f"Signed in as {user['username']}")
            self.refresh_all()
        else:
            messagebox.showerror("Login", "Incorrect password.")

    def register(self):
        dlg = RegisterDialog(self)
        self.wait_window(dlg)
        if not getattr(dlg, 'result', None): return
        username, email, password = dlg.result
        try:
            safe_execute("INSERT INTO User (username, email, password) VALUES (%s,%s,%s)", (username, email, hash_password(password)))
            messagebox.showinfo("Registered", "Account created. Please log in.")
        except Exception as e:
            messagebox.showerror("Register", str(e))

    def refresh_all(self):
        self.browse_tab.load_default()
        self.playlists_tab.load_playlists()
        self.library_tab.load_library()
        self.profile_tab.load_profile()

def add_track_to_playlist(playlist_id, track_id):
    """Add a track to a playlist; return False (with a message) if it is already there."""
    try:
        safe_execute("INSERT INTO PlaylistTrack (playlist_id, track_id) VALUES (%s,%s)", (playlist_id, track_id))
    except mysql.connector.IntegrityError:
        messagebox.showinfo("Already added", "That track is already in this playlist.")
        return False
    messagebox.showinfo("Added", "Track added to playlist.")
    return True

# ---------- Dialogs ----------
class LoginDialog(tk.Toplevel):
    def __init__(self, parent):
        super().__init__(parent)
        self.title("Login")
        ttk.Label(self, text="Username").pack(padx=8, pady=2); self.eu = ttk.Entry(self); self.eu.pack(padx=8,pady=2)
        ttk.Label(self, text="Password").pack(padx=8, pady=2); self.ep = ttk.Entry(self, show="*"); self.ep.pack(padx=8,pady=2)
        ttk.Button(self, text="Login", command=self.on_ok).pack(padx=8,pady=8)
        self.result = None
    def on_ok(self):
        u = self.eu.get().strip(); p = self.ep.get().strip()
        if not (u and p): messagebox.showwarning("Required","Enter username and password"); return
        self.result = (u,p); self.destroy()

class RegisterDialog(tk.Toplevel):
    def __init__(self, parent):
        super().__init__(parent)
        self.title("Register")
        ttk.Label(self, text="Username").pack(padx=8,pady=2); self.eu=ttk.Entry(self); self.eu.pack()
        ttk.Label(self, text="Email").pack(padx=8,pady=2); self.ee=ttk.Entry(self); self.ee.pack()
        ttk.Label(self, text="Password").pack(padx=8,pady=2); self.ep=ttk.Entry(self, show="*"); self.ep.pack()
        ttk.Button(self, text="Register", command=self.on_ok).pack(padx=8,pady=8)
        self.result=None
    def on_ok(self):
        u=self.eu.get().strip(); e=self.ee.get().strip(); p=self.ep.get().strip()
        if not (u and e and p): messagebox.showwarning("Required","All fields required"); return
        self.result=(u,e,p); self.destroy()

# ---------- Browse Tab ----------
class BrowseTab(ttk.Frame):
    def __init__(self, parent, app):
        super().__init__(parent); self.app=app; self._build()

    def _build(self):
        top = ttk.Frame(self); top.pack(fill='x', pady=4)
        self.q = ttk.Entry(top); self.q.pack(side='left', fill='x', expand=True, padx=6)
        ttk.Button(top, text="Search", command=self.search).pack(side='left')
        ttk.Button(top, text="Top", command=self.top_trending).pack(side='left', padx=6)
        cols = ("track_id","title","artist","album","duration","liked")
        self.tv = ttk.Treeview(self, columns=cols, show='headings')
        for c in cols: self.tv.heading(c, text=c); self.tv.column(c, width=140)
        self.tv.pack(fill='both', expand=True, padx=6, pady=6)
        self.tv.bind("<Double-1>", self.open_file)
        btns = ttk.Frame(self); btns.pack(fill='x')
        ttk.Button(btns, text="Like/Unlike", command=self.toggle_like).pack(side='left', padx=6)
        ttk.Button(btns, text="Add to Playlist", command=self.add_to_playlist).pack(side='left', padx=6)
        self.load_default()

    def load_default(self):
        uid = self.app.user['user_id'] if self.app.user else -1
        
        # Use GetUserRecommendations if user is logged in, otherwise show all tracks
        if self.app.user:
            rows = call_procedure("GetUserRecommendations", (uid, 200)) or []
            # Map procedure output to expected column names
            liked_ids = self._liked_ids(uid)
            for row in rows:
                row['title'] = row.get('track_title', '')
                row['artist'] = row.get('artist_name', '')
                row['album'] = row.get('album_title', '')
                row['duration'] = row.get('duration_seconds', '')
                row['liked'] = 'Yes' if row['track_id'] in liked_ids else 'No'
        else:
            # Show trending tracks if not logged in
            rows = safe_execute("""
                SELECT t.track_id, t.track_title AS title, ar.artist_name AS artist, al.album_title AS album, t.duration_seconds AS duration,
                CASE WHEN EXISTS(SELECT 1 FROM UserLikedTrack ult WHERE ult.user_id=%s AND ult.track_id=t.track_id) THEN 'Yes' ELSE 'No' END AS liked
                FROM Track t JOIN Album al ON t.album_id=al.album_id JOIN Artist ar ON al.artist_id=ar.artist_id
                LIMIT 200
            """, (uid,), fetch=True) or []
        
        self._populate(rows)

    def _liked_ids(self, uid):
        rows = safe_execute("SELECT track_id FROM UserLikedTrack WHERE user_id=%s", (uid,), fetch=True) or []
        return {r['track_id'] for r in rows}

    def _populate(self, rows):
        for r in self.tv.get_children(): self.tv.delete(r)
        for row in rows:
            self.tv.insert("", "end", values=(row['track_id'], row['title'], row['artist'], row['album'], row.get('duration') or '', row.get('liked') or 'No'))

    def search(self):
        q = self.q.get().strip() or None
        uid = self.app.user['user_id'] if self.app.user else -1
        # Call SearchTracks stored procedure
        # Parameters: p_search_term, p_genre_id, p_artist_id, p_limit, p_offset
        rows = call_procedure("SearchTracks", (q, None, None, 500, 0)) or []
        # Add liked status
        liked_tracks = safe_execute("SELECT track_id FROM UserLikedTrack WHERE user_id=%s", (uid,), fetch=True) or []
        liked_ids = {lt['track_id'] for lt in liked_tracks}
        for row in rows:
            row['liked'] = 'Yes' if row['track_id'] in liked_ids else 'No'
        self._populate(rows)

    def top_trending(self):
        # Call GetTrendingTracks stored procedure
        rows = call_procedure("GetTrendingTracks", (50,)) or []
        # Map fields and add liked status
        uid = self.app.user['user_id'] if self.app.user else -1
        liked_tracks = safe_execute("SELECT track_id FROM UserLikedTrack WHERE user_id=%s", (uid,), fetch=True) or []
        liked_ids = {lt['track_id'] for lt in liked_tracks}
        for row in rows:
            row['title'] = row.get('track_title', '')
            row['artist'] = row.get('artist_name', '')
            row['album'] = row.get('album_title', '')
            row['liked'] = 'Yes' if row['track_id'] in liked_ids else 'No'
        self._populate(rows)

    def get_selected(self):
        sel = self.tv.selection()
        if not sel: messagebox.showwarning("Select","Select a track"); return None
        return int(self.tv.item(sel[0],'values')[0])

    def toggle_like(self):
        if not self.app.user: messagebox.showwarning("Sign in","Please sign in"); return
        tid = self.get_selected(); 
        if not tid: return
        exists = safe_execute("SELECT 1 FROM UserLikedTrack WHERE user_id=%s AND track_id=%s", (self.app.user['user_id'], tid), fetch=True)
        if exists:
            safe_execute("DELETE FROM UserLikedTrack WHERE user_id=%s AND track_id=%s", (self.app.user['user_id'], tid))
            messagebox.showinfo("Unliked","Removed")
        else:
            safe_execute("INSERT INTO UserLikedTrack (user_id, track_id) VALUES (%s,%s)", (self.app.user['user_id'], tid))
            messagebox.showinfo("Liked","Added")
        self.load_default()

    def add_to_playlist(self):
        if not self.app.user: messagebox.showwarning("Sign in","Please sign in"); return
        tid = self.get_selected(); 
        if not tid: return
        pls = safe_execute("SELECT playlist_id, playlist_name FROM Playlist WHERE created_by=%s", (self.app.user['user_id'],), fetch=True) or []
        if not pls:
            if messagebox.askyesno("No playlists","Create new playlist?"):
                name = simpledialog.askstring("Name","Playlist name:")
                if name:
                    safe_execute("INSERT INTO Playlist (playlist_name, created_by, is_public) VALUES (%s,%s,%s)", (name, self.app.user['user_id'], True))
                    messagebox.showinfo("Created","Playlist created. Add track again.")
            return
        choice = simpledialog.askinteger("Choose", "Enter playlist_id:\n" + "\n".join([f"{p['playlist_id']}: {p['playlist_name']}" for p in pls]))
        if choice:
            add_track_to_playlist(choice, tid)

    def open_file(self, _event=None):
        sel = self.tv.selection()
        if not sel: messagebox.showwarning("Select","Select a track"); return
        tid = int(self.tv.item(sel[0],'values')[0])
        rows = safe_execute("SELECT file_path FROM Track WHERE track_id=%s", (tid,), fetch=True)
        if not rows or not rows[0].get('file_path'):
            messagebox.showwarning("No file","File path missing")
            return
        path = rows[0]['file_path']
        if not os.path.exists(path):
            messagebox.showwarning("Missing","File not found: "+path); return
        try:
            webbrowser.open(path)
        except Exception as e:
            messagebox.showerror("Open failed", str(e))

class PlaylistsTab(ttk.Frame):
    def __init__(self, parent, app):
        super().__init__(parent); self.app=app; self._build()

    def _build(self):
        left = ttk.Frame(self); left.pack(side='left', fill='y', padx=6, pady=6)
        right = ttk.Frame(self); right.pack(side='right', fill='both', expand=True, padx=6, pady=6)

        ttk.Label(left, text="Create Playlist").pack(pady=4)
        self.name_e = ttk.Entry(left); self.name_e.pack(fill='x', pady=2)
        ttk.Button(left, text="Create", command=self.create).pack(fill='x', pady=4)
        ttk.Button(left, text="Refresh", command=self.load_playlists).pack(fill='x')

        cols = ("playlist_id","playlist_name","created_at","track_count")
        self.tv = ttk.Treeview(right, columns=cols, show='headings')
        for c in cols: self.tv.heading(c,text=c); self.tv.column(c,width=160)
        self.tv.pack(fill='both', expand=True)
        self.tv.bind("<<TreeviewSelect>>", self.on_select)

        self.tracks_tv = ttk.Treeview(self, columns=("track_id","title","artist","duration"), show='headings', height=8)
        for c in self.tracks_tv["columns"]: self.tracks_tv.heading(c, text=c); self.tracks_tv.column(c, width=160)
        self.tracks_tv.pack(fill='x', padx=6, pady=6)

        btns = ttk.Frame(self); btns.pack(fill='x', pady=4)
        ttk.Button(btns, text="Add from Browse", command=self.add_from_browse).pack(side='left', padx=6)
        ttk.Button(btns, text="Remove Selected", command=self.remove_selected).pack(side='left', padx=6)
        ttk.Button(btns, text="Delete Playlist", command=self.delete_playlist).pack(side='left', padx=6)

        self.load_playlists()

    def create(self):
        if not self.app.user: messagebox.showwarning("Sign in","Please sign in"); return
        name = self.name_e.get().strip()
        if not name: messagebox.showwarning("Name","Playlist name required"); return
        safe_execute("INSERT INTO Playlist (playlist_name, created_by, is_public) VALUES (%s,%s,%s)", (name, self.app.user['user_id'], True))
        messagebox.showinfo("Created","Playlist created"); self.load_playlists()

    def load_playlists(self):
        if not self.app.user:
            rows = []
        else:
            rows = safe_execute("SELECT p.playlist_id, p.playlist_name, p.created_at, (SELECT COUNT(*) FROM PlaylistTrack pt WHERE pt.playlist_id=p.playlist_id) AS track_count FROM Playlist p WHERE p.created_by=%s", (self.app.user['user_id'],), fetch=True) or []
        for r in self.tv.get_children(): self.tv.delete(r)
        for row in rows: self.tv.insert("", "end", values=(row['playlist_id'], row['playlist_name'], row['created_at'], row.get('track_count') or 0))
        for r in self.tracks_tv.get_children(): self.tracks_tv.delete(r)

    def on_select(self, _):
        sel = self.tv.selection()
        if not sel: return
        pid = int(self.tv.item(sel[0],'values')[0])
        rows = safe_execute("""
            SELECT t.track_id, t.track_title AS title, ar.artist_name AS artist, t.duration_seconds AS duration
            FROM PlaylistTrack pt JOIN Track t ON pt.track_id=t.track_id JOIN Album al ON t.album_id=al.album_id JOIN Artist ar ON al.artist_id=ar.artist_id
            WHERE pt.playlist_id=%s
        """, (pid,), fetch=True) or []
        for r in self.tracks_tv.get_children(): self.tracks_tv.delete(r)
        for row in rows: self.tracks_tv.insert("", "end", values=(row['track_id'], row['title'], row['artist'], row.get('duration')))

    def add_from_browse(self):
        if not self.app.user: messagebox.showwarning("Sign in","Please sign in"); return
        browse = self.app.browse_tab
        sel = browse.tv.selection()
        if not sel: messagebox.showwarning("Select","Select a track in Browse tab"); return
        tid = int(browse.tv.item(sel[0],'values')[0])
        selp = self.tv.selection()
        if not selp: messagebox.showwarning("Select","Select a playlist"); return
        pid = int(self.tv.item(selp[0],'values')[0])
        if add_track_to_playlist(pid, tid):
            self.on_select(None)

    def remove_selected(self):
        sel = self.tracks_tv.selection(); 
        if not sel: messagebox.showwarning("Select","Select a track"); return
        tid = int(self.tracks_tv.item(sel[0],'values')[0])
        pid_sel = self.tv.selection()
        if not pid_sel: messagebox.showwarning("Select","Select playlist"); return
        pid = int(self.tv.item(pid_sel[0],'values')[0])
        safe_execute("DELETE FROM PlaylistTrack WHERE playlist_id=%s AND track_id=%s LIMIT 1", (pid, tid))
        messagebox.showinfo("Removed","Track removed"); self.on_select(None)

    def delete_playlist(self):
        sel = self.tv.selection()
        if not sel: messagebox.showwarning("Select","Select playlist"); return
        pid = int(self.tv.item(sel[0],'values')[0])
        if messagebox.askyesno("Confirm","Delete playlist?"):
            safe_execute("DELETE FROM Playlist WHERE playlist_id=%s", (pid,))
            messagebox.showinfo("Deleted","Playlist deleted"); self.load_playlists()

class LibraryTab(ttk.Frame):
    def __init__(self, parent, app):
        super().__init__(parent); self.app=app; self._build()

    def _build(self):
        ttk.Label(self, text="Liked Tracks").pack(padx=6,pady=4)
        self.liked = ttk.Treeview(self, columns=("track_id","title","artist"), show='headings', height=8)
        for c in self.liked["columns"]: self.liked.heading(c,text=c); self.liked.column(c,width=260)
        self.liked.pack(fill='x', padx=6, pady=4)
        ttk.Label(self, text="Followed Artists").pack(padx=6,pady=4)
        self.followed = ttk.Treeview(self, columns=("artist_id","artist_name"), show='headings', height=6)
        for c in self.followed["columns"]: self.followed.heading(c,text=c); self.followed.column(c,width=260)
        self.followed.pack(fill='x', padx=6, pady=4)
        btns = ttk.Frame(self); btns.pack(fill='x', pady=4)
        ttk.Button(btns, text="Unlike", command=self.unlike).pack(side='left', padx=6)
        ttk.Button(btns, text="Unfollow", command=self.unfollow).pack(side='left', padx=6)
        ttk.Button(btns, text="Refresh", command=self.load_library).pack(side='left', padx=6)
        self.load_library()

    def load_library(self):
        if not self.app.user:
            rows=[]; artists=[]
        else:
            rows = safe_execute("""
                SELECT t.track_id, t.track_title AS title, ar.artist_name AS artist
                FROM UserLikedTrack ult JOIN Track t ON ult.track_id=t.track_id JOIN Album al ON t.album_id=al.album_id JOIN Artist ar ON al.artist_id=ar.artist_id
                WHERE ult.user_id=%s
            """, (self.app.user['user_id'],), fetch=True) or []
            artists = safe_execute("""
                SELECT a.artist_id, a.artist_name FROM UserFollowArtist ufa JOIN Artist a ON ufa.artist_id=a.artist_id WHERE ufa.user_id=%s
            """, (self.app.user['user_id'],), fetch=True) or []
        for r in self.liked.get_children(): self.liked.delete(r)
        for row in rows: self.liked.insert("", "end", values=(row['track_id'], row['title'], row['artist']))
        for r in self.followed.get_children(): self.followed.delete(r)
        for a in artists: self.followed.insert("", "end", values=(a['artist_id'], a['artist_name']))

    def unlike(self):
        if not self.app.user: return
        sel = self.liked.selection()
        if not sel: messagebox.showwarning("Select","Select liked track"); return
        tid = int(self.liked.item(sel[0],'values')[0])
        safe_execute("DELETE FROM UserLikedTrack WHERE user_id=%s AND track_id=%s", (self.app.user['user_id'], tid))
        messagebox.showinfo("Unliked","Removed"); self.load_library()

    def unfollow(self):
        if not self.app.user: return
        sel = self.followed.selection()
        if not sel: messagebox.showwarning("Select","Select artist"); return
        aid = int(self.followed.item(sel[0],'values')[0])
        safe_execute("DELETE FROM UserFollowArtist WHERE user_id=%s AND artist_id=%s", (self.app.user['user_id'], aid))
        messagebox.showinfo("Unfollowed","Removed"); self.load_library()

class ProfileTab(ttk.Frame):
    def __init__(self, parent, app):
        super().__init__(parent); self.app=app; self._build()

    def _build(self):
        self.info = tk.Text(self, height=10); self.info.pack(fill='x', padx=6, pady=6)
        ttk.Button(self, text="Refresh", command=self.load_profile).pack(padx=6, pady=4)
        ttk.Button(self, text="Edit Name", command=self.edit_name).pack(padx=6, pady=4)
        self.load_profile()

    def load_profile(self):
        self.info.delete('1.0','end')
        if not self.app.user:
            self.info.insert('end', "Not signed in\n"); return
        u = safe_execute("SELECT user_id, username, email, first_name, last_name, country, date_of_birth, created_at FROM User WHERE user_id=%s", (self.app.user['user_id'],), fetch=True)[0]
        for k,v in u.items():
            self.info.insert('end', f"{k}: {v}\n")

    def edit_name(self):
        if not self.app.user: messagebox.showwarning("Sign in","Please sign in"); return
        fn = simpledialog.askstring("First name","First name:", initialvalue=self.app.user.get('first_name') or '')
        ln = simpledialog.askstring("Last name","Last name:", initialvalue=self.app.user.get('last_name') or '')
        if fn is None or ln is None: return
        safe_execute("UPDATE User SET first_name=%s, last_name=%s WHERE user_id=%s", (fn, ln, self.app.user['user_id']))
        self.app.user = safe_execute("SELECT * FROM User WHERE user_id=%s", (self.app.user['user_id'],), fetch=True)[0]
        self.app.lbl_user.config(text=f"Signed in: {self.app.user['username']}")
        self.load_profile()

# ---------- Run ----------
if __name__ == "__main__":
    app = UserApp()
    app.mainloop()
