# create_helper_tables.py
from db_utils import safe_execute

sqls = [
"""
CREATE TABLE IF NOT EXISTS UserLikedTrack (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  track_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY ux_user_track (user_id, track_id),
  INDEX idx_user (user_id),
  INDEX idx_track (track_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
""",
"""
CREATE TABLE IF NOT EXISTS UserFollowArtist (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  artist_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY ux_user_artist (user_id, artist_id),
  INDEX idx_user (user_id),
  INDEX idx_artist (artist_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
""",
"""
CREATE TABLE IF NOT EXISTS PlaylistTrack (
  id INT AUTO_INCREMENT PRIMARY KEY,
  playlist_id INT NOT NULL,
  track_id INT NOT NULL,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  position INT DEFAULT NULL,
  UNIQUE KEY ux_playlist_track (playlist_id, track_id),
  INDEX idx_playlist (playlist_id),
  INDEX idx_track (track_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""
]

for s in sqls:
    try:
        safe_execute(s)
        print("Executed statement OK.")
    except Exception as e:
        print("Error executing statement:", e)
