-- ============================================================
-- VaMusic merged schema + full sample data (ready to import)
-- File: legacy/mysql/vamusic_v2.sql
-- Import: mysql -u root -p < legacy/mysql/vamusic_v2.sql
-- ============================================================

DROP DATABASE IF EXISTS vamusic;
CREATE DATABASE vamusic;
USE vamusic;

-- disable strict FK checks for the rest of the file where necessary (re-enabled later)
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- TABLES CREATION (fixed)
-- ============================================================

CREATE TABLE Genre (
    genre_id INT AUTO_INCREMENT PRIMARY KEY,
    genre_name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    parent_genre_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_genre_id) REFERENCES Genre(genre_id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE Subscription (
    subscription_id INT AUTO_INCREMENT PRIMARY KEY,
    plan_name VARCHAR(50) UNIQUE NOT NULL,
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    duration_days INT NOT NULL DEFAULT 30,
    download_limit INT DEFAULT 0,
    ad_free BOOLEAN DEFAULT FALSE,
    high_quality BOOLEAN DEFAULT FALSE,
    offline_mode BOOLEAN DEFAULT FALSE,
    max_devices INT DEFAULT 1,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE `User` (
    user_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    profile_picture VARCHAR(255),
    date_of_birth DATE,
    country VARCHAR(2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,
    INDEX idx_user_email (email),
    INDEX idx_user_username (username),
    INDEX idx_user_country (country)
) ENGINE=InnoDB;

CREATE TABLE UserSubscription (
    user_subscription_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    subscription_id INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    status ENUM('active', 'cancelled', 'expired', 'paused') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES `User`(user_id) ON DELETE CASCADE,
    FOREIGN KEY (subscription_id) REFERENCES Subscription(subscription_id) ON DELETE RESTRICT,
    INDEX idx_user_subscription (user_id, status),
    INDEX idx_subscription_dates (start_date, end_date)
) ENGINE=InnoDB;

CREATE TABLE Artist (
    artist_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    artist_name VARCHAR(100) NOT NULL,
    bio TEXT,
    country VARCHAR(2),
    profile_image VARCHAR(255),
    is_verified BOOLEAN DEFAULT FALSE,
    monthly_listeners INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_artist_name (artist_name),
    INDEX idx_artist_verified (is_verified)
) ENGINE=InnoDB;

CREATE TABLE Album (
    album_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    album_title VARCHAR(200) NOT NULL,
    artist_id BIGINT NOT NULL,
    release_date DATE,
    album_type ENUM('single', 'EP', 'album', 'compilation') DEFAULT 'album',
    cover_image VARCHAR(255),
    total_tracks INT DEFAULT 0,
    genre_id INT,
    record_label VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (artist_id) REFERENCES Artist(artist_id) ON DELETE CASCADE,
    FOREIGN KEY (genre_id) REFERENCES Genre(genre_id) ON DELETE SET NULL,
    INDEX idx_album_artist (artist_id),
    INDEX idx_album_release (release_date),
    INDEX idx_album_genre (genre_id)
) ENGINE=InnoDB;

CREATE TABLE Track (
    track_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    track_title VARCHAR(200) NOT NULL,
    album_id BIGINT NOT NULL,
    duration_seconds INT NOT NULL CHECK (duration_seconds > 0),
    track_number INT,
    file_path VARCHAR(500) NOT NULL,
    play_count BIGINT DEFAULT 0,
    lyrics_path VARCHAR(500),
    is_explicit BOOLEAN DEFAULT FALSE,
    release_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    trending_score DECIMAL(10,2) DEFAULT 0,
    last_played TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (album_id) REFERENCES Album(album_id) ON DELETE CASCADE,
    INDEX idx_track_album (album_id),
    INDEX idx_track_playcount (play_count),
    INDEX idx_track_trending (trending_score),
    INDEX idx_track_release (release_date)
) ENGINE=InnoDB;

-- ============================================================
-- FIX: Make Track table safer for admin UI inserts
-- ============================================================

ALTER TABLE Track
  MODIFY COLUMN track_number INT DEFAULT NULL,
  MODIFY COLUMN file_path VARCHAR(500) DEFAULT NULL,
  MODIFY COLUMN lyrics_path VARCHAR(500) DEFAULT NULL,
  MODIFY COLUMN is_explicit BOOLEAN DEFAULT FALSE,
  MODIFY COLUMN duration_seconds INT NOT NULL;


CREATE TABLE Playlist (
    playlist_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    playlist_name VARCHAR(100) NOT NULL,
    created_by BIGINT NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT TRUE,
    cover_image VARCHAR(255),
    follower_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES `User`(user_id) ON DELETE CASCADE,
    INDEX idx_playlist_creator (created_by),
    INDEX idx_playlist_public (is_public)
) ENGINE=InnoDB;

CREATE TABLE PlaylistTrack (
    playlist_id BIGINT NOT NULL,
    track_id BIGINT NOT NULL,
    position INT DEFAULT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    added_by BIGINT DEFAULT NULL,
    PRIMARY KEY (playlist_id, track_id),
    FOREIGN KEY (playlist_id) REFERENCES Playlist(playlist_id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES Track(track_id) ON DELETE CASCADE,
    FOREIGN KEY (added_by) REFERENCES `User`(user_id) ON DELETE SET NULL ON UPDATE CASCADE,
    INDEX idx_playlist_track_position (playlist_id, position)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS UserLikedTrack (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    track_id BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY ux_user_track (user_id, track_id),
    INDEX idx_ult_user (user_id),
    INDEX idx_ult_track (track_id),
    FOREIGN KEY (user_id) REFERENCES `User`(user_id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES Track(track_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS UserFollowArtist (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    artist_id BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY ux_user_artist (user_id, artist_id),
    INDEX idx_ufa_user (user_id),
    INDEX idx_ufa_artist (artist_id),
    FOREIGN KEY (user_id) REFERENCES `User`(user_id) ON DELETE CASCADE,
    FOREIGN KEY (artist_id) REFERENCES Artist(artist_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE UserPlaylist (
    user_id BIGINT NOT NULL,
    playlist_id BIGINT NOT NULL,
    is_owner BOOLEAN DEFAULT FALSE,
    followed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, playlist_id),
    FOREIGN KEY (user_id) REFERENCES `User`(user_id) ON DELETE CASCADE,
    FOREIGN KEY (playlist_id) REFERENCES Playlist(playlist_id) ON DELETE CASCADE,
    INDEX idx_user_playlist (user_id)
) ENGINE=InnoDB;

CREATE TABLE ListeningHistory (
    history_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    track_id BIGINT NOT NULL,
    listened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    playback_duration INT,
    device_type VARCHAR(50),
    streaming_quality ENUM('low', 'medium', 'high', 'lossless') DEFAULT 'medium',
    completed BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (user_id) REFERENCES `User`(user_id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES Track(track_id) ON DELETE CASCADE,
    INDEX idx_history_user (user_id, listened_at),
    INDEX idx_history_track (track_id),
    INDEX idx_history_date (listened_at)
) ENGINE=InnoDB;

CREATE TABLE UserFollowing (
    follower_id BIGINT NOT NULL,
    following_id BIGINT NOT NULL,
    following_type ENUM('user', 'artist') NOT NULL,
    followed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id, following_type),
    FOREIGN KEY (follower_id) REFERENCES `User`(user_id) ON DELETE CASCADE,
    INDEX idx_following_follower (follower_id),
    INDEX idx_following_followed (following_id)
) ENGINE=InnoDB;

CREATE TABLE UserFavorites (
    user_id BIGINT NOT NULL,
    track_id BIGINT NOT NULL,
    favorited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, track_id),
    FOREIGN KEY (user_id) REFERENCES `User`(user_id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES Track(track_id) ON DELETE CASCADE,
    INDEX idx_favorites_user (user_id),
    INDEX idx_favorites_date (favorited_at)
) ENGINE=InnoDB;

CREATE TABLE TrackArtist (
    track_id BIGINT NOT NULL,
    artist_id BIGINT NOT NULL,
    role ENUM('primary', 'featured', 'producer', 'composer') DEFAULT 'primary',
    PRIMARY KEY (track_id, artist_id),
    FOREIGN KEY (track_id) REFERENCES Track(track_id) ON DELETE CASCADE,
    FOREIGN KEY (artist_id) REFERENCES Artist(artist_id) ON DELETE CASCADE,
    INDEX idx_track_artist (artist_id)
) ENGINE=InnoDB;

CREATE TABLE Payment (
    payment_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_subscription_id BIGINT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_method ENUM('credit_card', 'debit_card', 'paypal', 'upi', 'netbanking') NOT NULL,
    transaction_id VARCHAR(100) UNIQUE NOT NULL,
    status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_subscription_id) REFERENCES UserSubscription(user_subscription_id) ON DELETE CASCADE,
    INDEX idx_payment_status (status),
    INDEX idx_payment_date (payment_date)
) ENGINE=InnoDB;

CREATE TABLE UserStatistics (
    user_id BIGINT PRIMARY KEY,
    total_minutes INT DEFAULT 0,
    songs_played INT DEFAULT 0,
    favorite_genre_id INT,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES `User`(user_id) ON DELETE CASCADE,
    FOREIGN KEY (favorite_genre_id) REFERENCES Genre(genre_id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE SubscriptionAudit (
    audit_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    old_plan VARCHAR(50),
    new_plan VARCHAR(50),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    changed_by VARCHAR(50),
    FOREIGN KEY (user_id) REFERENCES `User`(user_id) ON DELETE CASCADE,
    INDEX idx_audit_user (user_id),
    INDEX idx_audit_date (changed_at)
) ENGINE=InnoDB;

-- ============================================================
-- TRIGGERS, PROCEDURES, FUNCTIONS, VIEWS (as before)
-- ============================================================

-- safe drop if triggers exist
DROP TRIGGER IF EXISTS update_play_count;
DROP TRIGGER IF EXISTS update_user_stats;
DROP TRIGGER IF EXISTS subscription_audit_log;
DROP TRIGGER IF EXISTS update_album_track_count_insert;
DROP TRIGGER IF EXISTS update_album_track_count_delete;
DROP TRIGGER IF EXISTS calculate_trending_score;
DROP TRIGGER IF EXISTS update_playlist_followers_insert;
DROP TRIGGER IF EXISTS update_playlist_followers_delete;

DELIMITER //

CREATE TRIGGER update_play_count
AFTER INSERT ON ListeningHistory
FOR EACH ROW
BEGIN
    UPDATE Track 
    SET play_count = play_count + 1,
        last_played = NEW.listened_at
    WHERE track_id = NEW.track_id;
    
    UPDATE Artist a
    INNER JOIN Album al ON a.artist_id = al.artist_id
    INNER JOIN Track t ON al.album_id = t.album_id
    SET a.monthly_listeners = (
        SELECT COUNT(DISTINCT lh.user_id)
        FROM ListeningHistory lh
        INNER JOIN Track t2 ON lh.track_id = t2.track_id
        INNER JOIN Album al2 ON t2.album_id = al2.album_id
        WHERE al2.artist_id = a.artist_id
        AND lh.listened_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
    )
    WHERE t.track_id = NEW.track_id;
END//

CREATE TRIGGER update_user_stats
AFTER INSERT ON ListeningHistory
FOR EACH ROW
BEGIN
    INSERT INTO UserStatistics (user_id, total_minutes, songs_played)
    VALUES (NEW.user_id, NEW.playback_duration / 60, 1)
    ON DUPLICATE KEY UPDATE
        total_minutes = total_minutes + (NEW.playback_duration / 60),
        songs_played = songs_played + 1;
END//

CREATE TRIGGER subscription_audit_log
AFTER UPDATE ON UserSubscription
FOR EACH ROW
BEGIN
    IF OLD.subscription_id != NEW.subscription_id THEN
        INSERT INTO SubscriptionAudit(user_id, old_plan, new_plan, changed_by)
        SELECT 
            NEW.user_id,
            s1.plan_name,
            s2.plan_name,
            'System'
        FROM Subscription s1, Subscription s2
        WHERE s1.subscription_id = OLD.subscription_id
        AND s2.subscription_id = NEW.subscription_id;
    END IF;
END//

CREATE TRIGGER update_album_track_count_insert
AFTER INSERT ON Track
FOR EACH ROW
BEGIN
    UPDATE Album 
    SET total_tracks = (
        SELECT COUNT(*) FROM Track WHERE album_id = NEW.album_id
    )
    WHERE album_id = NEW.album_id;
END//

CREATE TRIGGER update_album_track_count_delete
AFTER DELETE ON Track
FOR EACH ROW
BEGIN
    UPDATE Album 
    SET total_tracks = (
        SELECT COUNT(*) FROM Track WHERE album_id = OLD.album_id
    )
    WHERE album_id = OLD.album_id;
END//

CREATE TRIGGER calculate_trending_score
AFTER INSERT ON ListeningHistory
FOR EACH ROW
BEGIN
    DECLARE v_recent_plays INT;
    DECLARE v_unique_listeners INT;
    DECLARE v_favorite_count INT;
    
    SELECT COUNT(*) INTO v_recent_plays
    FROM ListeningHistory
    WHERE track_id = NEW.track_id
    AND listened_at > DATE_SUB(NOW(), INTERVAL 7 DAY);
    
    SELECT COUNT(DISTINCT user_id) INTO v_unique_listeners
    FROM ListeningHistory
    WHERE track_id = NEW.track_id
    AND listened_at > DATE_SUB(NOW(), INTERVAL 30 DAY);
    
    SELECT COUNT(*) INTO v_favorite_count
    FROM UserFavorites
    WHERE track_id = NEW.track_id;
    
    UPDATE Track 
    SET trending_score = 
        (v_recent_plays * 0.5) + 
        (v_unique_listeners * 2) + 
        (v_favorite_count * 1.5)
    WHERE track_id = NEW.track_id;
END//

CREATE TRIGGER update_playlist_followers_insert
AFTER INSERT ON UserPlaylist
FOR EACH ROW
BEGIN
    IF NEW.is_owner = FALSE THEN
        UPDATE Playlist 
        SET follower_count = follower_count + 1
        WHERE playlist_id = NEW.playlist_id;
    END IF;
END//

CREATE TRIGGER update_playlist_followers_delete
AFTER DELETE ON UserPlaylist
FOR EACH ROW
BEGIN
    IF OLD.is_owner = FALSE THEN
        UPDATE Playlist 
        SET follower_count = follower_count - 1
        WHERE playlist_id = OLD.playlist_id;
    END IF;
END//

DELIMITER ;


-- ============================================================
-- PROCEDURES & FUNCTIONS (corrected with DELIMITER handling)
-- Place this after CREATE TABLE and CREATE TRIGGER blocks.
-- ============================================================

DELIMITER //

-- 1. Get user recommendations based on listening history
DROP PROCEDURE IF EXISTS GetUserRecommendations//
CREATE PROCEDURE GetUserRecommendations(
    IN p_user_id BIGINT,
    IN p_limit INT
)
BEGIN
    SELECT DISTINCT 
        t.track_id,
        t.track_title,
        ar.artist_name,
        al.album_title,
        t.duration_seconds,
        t.play_count,
        t.trending_score
    FROM Track t
    INNER JOIN Album al ON t.album_id = al.album_id
    INNER JOIN Artist ar ON al.artist_id = ar.artist_id
    WHERE al.genre_id IN (
        -- User's top 3 genres
        SELECT genre_id FROM (
            SELECT al2.genre_id, COUNT(*) as listen_count
            FROM ListeningHistory lh
            INNER JOIN Track t2 ON lh.track_id = t2.track_id
            INNER JOIN Album al2 ON t2.album_id = al2.album_id
            WHERE lh.user_id = p_user_id
            AND lh.listened_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY al2.genre_id
            ORDER BY listen_count DESC
            LIMIT 3
        ) AS top_genres
    )
    AND t.track_id NOT IN (
        -- Exclude recently played tracks
        SELECT DISTINCT track_id 
        FROM ListeningHistory 
        WHERE user_id = p_user_id
        AND listened_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
    )
    ORDER BY t.trending_score DESC, t.play_count DESC
    LIMIT p_limit;
END//

-- 2. Create a playlist with multiple tracks
DROP PROCEDURE IF EXISTS CreatePlaylistWithTracks//
CREATE PROCEDURE CreatePlaylistWithTracks(
    IN p_user_id BIGINT,
    IN p_playlist_name VARCHAR(100),
    IN p_description TEXT,
    IN p_is_public BOOLEAN,
    IN p_track_ids TEXT
)
BEGIN
    DECLARE v_playlist_id BIGINT;
    DECLARE v_track_id BIGINT;
    DECLARE v_position INT DEFAULT 1;
    DECLARE v_remaining_tracks TEXT;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error creating playlist';
    END;
    
    START TRANSACTION;
    
    -- Create playlist
    INSERT INTO Playlist(playlist_name, created_by, description, is_public)
    VALUES(p_playlist_name, p_user_id, p_description, p_is_public);
    
    SET v_playlist_id = LAST_INSERT_ID();
    
    -- Add user as owner
    INSERT INTO UserPlaylist(user_id, playlist_id, is_owner)
    VALUES(p_user_id, v_playlist_id, TRUE);
    
    -- Parse and add tracks
    SET v_remaining_tracks = p_track_ids;
    
    WHILE LENGTH(v_remaining_tracks) > 0 DO
        IF LOCATE(',', v_remaining_tracks) > 0 THEN
            SET v_track_id = SUBSTRING(v_remaining_tracks, 1, LOCATE(',', v_remaining_tracks) - 1);
            SET v_remaining_tracks = SUBSTRING(v_remaining_tracks, LOCATE(',', v_remaining_tracks) + 1);
        ELSE
            SET v_track_id = v_remaining_tracks;
            SET v_remaining_tracks = '';
        END IF;
        
        INSERT INTO PlaylistTrack(playlist_id, track_id, position, added_by)
        VALUES(v_playlist_id, v_track_id, v_position, p_user_id);
        
        SET v_position = v_position + 1;
    END WHILE;
    
    COMMIT;
    
    SELECT v_playlist_id as new_playlist_id, v_position - 1 as tracks_added;
END//

-- 3. Get user listening analytics
DROP PROCEDURE IF EXISTS GetUserAnalytics//
CREATE PROCEDURE GetUserAnalytics(
    IN p_user_id BIGINT,
    IN p_period VARCHAR(10)
)
BEGIN
    DECLARE v_date_filter DATE;
    
    SET v_date_filter = CASE p_period
        WHEN 'daily' THEN DATE_SUB(NOW(), INTERVAL 1 DAY)
        WHEN 'weekly' THEN DATE_SUB(NOW(), INTERVAL 7 DAY)
        WHEN 'monthly' THEN DATE_SUB(NOW(), INTERVAL 30 DAY)
        WHEN 'yearly' THEN DATE_SUB(NOW(), INTERVAL 365 DAY)
        ELSE DATE_SUB(NOW(), INTERVAL 7 DAY)
    END;
    
    -- Total listening time
    SELECT 
        'Total Listening Time' as metric,
        CONCAT(
            FLOOR(SUM(playback_duration) / 3600), 'h ',
            FLOOR((SUM(playback_duration) % 3600) / 60), 'm'
        ) as value
    FROM ListeningHistory
    WHERE user_id = p_user_id AND listened_at >= v_date_filter;
    
    -- Top artists
    SELECT 
        'Top Artists' as metric,
        ar.artist_name,
        COUNT(DISTINCT lh.track_id) as unique_tracks,
        COUNT(*) as total_plays
    FROM ListeningHistory lh
    INNER JOIN Track t ON lh.track_id = t.track_id
    INNER JOIN Album al ON t.album_id = al.album_id
    INNER JOIN Artist ar ON al.artist_id = ar.artist_id
    WHERE lh.user_id = p_user_id AND lh.listened_at >= v_date_filter
    GROUP BY ar.artist_id
    ORDER BY total_plays DESC
    LIMIT 5;
    
    -- Top genres
    SELECT 
        'Top Genres' as metric,
        g.genre_name,
        COUNT(*) as play_count,
        CONCAT(ROUND(COUNT(*) * 100.0 / (
            SELECT COUNT(*) 
            FROM ListeningHistory 
            WHERE user_id = p_user_id AND listened_at >= v_date_filter
        ), 1), '%') as percentage
    FROM ListeningHistory lh
    INNER JOIN Track t ON lh.track_id = t.track_id
    INNER JOIN Album al ON t.album_id = al.album_id
    INNER JOIN Genre g ON al.genre_id = g.genre_id
    WHERE lh.user_id = p_user_id AND lh.listened_at >= v_date_filter
    GROUP BY g.genre_id
    ORDER BY play_count DESC
    LIMIT 5;
    
    -- Listening pattern by hour
    SELECT 
        'Hourly Pattern' as metric,
        HOUR(listened_at) as hour,
        COUNT(*) as plays
    FROM ListeningHistory
    WHERE user_id = p_user_id AND listened_at >= v_date_filter
    GROUP BY HOUR(listened_at)
    ORDER BY hour;
END//

-- 4. Search tracks with filters
DROP PROCEDURE IF EXISTS SearchTracks//
CREATE PROCEDURE SearchTracks(
    IN p_search_term VARCHAR(200),
    IN p_genre_id INT,
    IN p_artist_id BIGINT,
    IN p_limit INT,
    IN p_offset INT
)
BEGIN
    SELECT 
        t.track_id,
        t.track_title,
        ar.artist_name,
        al.album_title,
        g.genre_name,
        t.duration_seconds,
        t.play_count,
        t.trending_score
    FROM Track t
    INNER JOIN Album al ON t.album_id = al.album_id
    INNER JOIN Artist ar ON al.artist_id = ar.artist_id
    LEFT JOIN Genre g ON al.genre_id = g.genre_id
    WHERE 
        (p_search_term IS NULL OR 
         t.track_title LIKE CONCAT('%', p_search_term, '%') OR
         ar.artist_name LIKE CONCAT('%', p_search_term, '%') OR
         al.album_title LIKE CONCAT('%', p_search_term, '%'))
        AND (p_genre_id IS NULL OR al.genre_id = p_genre_id)
        AND (p_artist_id IS NULL OR ar.artist_id = p_artist_id)
    ORDER BY t.trending_score DESC, t.play_count DESC
    LIMIT p_limit OFFSET p_offset;
END//

-- 5. Get trending tracks
DROP PROCEDURE IF EXISTS GetTrendingTracks//
CREATE PROCEDURE GetTrendingTracks(
    IN p_limit INT
)
BEGIN
    SELECT 
        t.track_id,
        t.track_title,
        ar.artist_name,
        al.album_title,
        t.play_count,
        t.trending_score,
        COUNT(DISTINCT lh.user_id) as recent_listeners,
        COUNT(DISTINCT uf.user_id) as favorite_count
    FROM Track t
    INNER JOIN Album al ON t.album_id = al.album_id
    INNER JOIN Artist ar ON al.artist_id = ar.artist_id
    LEFT JOIN ListeningHistory lh ON t.track_id = lh.track_id 
        AND lh.listened_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
    LEFT JOIN UserFavorites uf ON t.track_id = uf.track_id
    GROUP BY t.track_id
    HAVING recent_listeners > 0
    ORDER BY t.trending_score DESC
    LIMIT p_limit;
END//

-- FUNCTIONS

DROP FUNCTION IF EXISTS FormatDuration//
CREATE FUNCTION FormatDuration(p_seconds INT)
RETURNS VARCHAR(20)
DETERMINISTIC
BEGIN
    DECLARE v_hours INT;
    DECLARE v_minutes INT;
    DECLARE v_seconds INT;
    
    SET v_hours = FLOOR(p_seconds / 3600);
    SET v_minutes = FLOOR((p_seconds % 3600) / 60);
    SET v_seconds = p_seconds % 60;
    
    IF v_hours > 0 THEN
        RETURN CONCAT(v_hours, ':', LPAD(v_minutes, 2, '0'), ':', LPAD(v_seconds, 2, '0'));
    ELSE
        RETURN CONCAT(v_minutes, ':', LPAD(v_seconds, 2, '0'));
    END IF;
END//

DROP FUNCTION IF EXISTS GetUserTier//
CREATE FUNCTION GetUserTier(p_user_id BIGINT)
RETURNS VARCHAR(50)
READS SQL DATA
BEGIN
    DECLARE v_total_minutes INT;
    
    -- A listener with no statistics row has listened for 0 minutes.
    SET v_total_minutes = COALESCE(
        (SELECT total_minutes FROM UserStatistics WHERE user_id = p_user_id), 0);
    
    RETURN CASE
        WHEN v_total_minutes = 0 THEN 'New Listener'
        WHEN v_total_minutes < 100 THEN 'Casual Listener'
        WHEN v_total_minutes < 500 THEN 'Regular Listener'
        WHEN v_total_minutes < 2000 THEN 'Music Enthusiast'
        WHEN v_total_minutes < 10000 THEN 'Audiophile'
        ELSE 'Music Master'
    END;
END//

DROP FUNCTION IF EXISTS CalculateMonthlyRevenue//
CREATE FUNCTION CalculateMonthlyRevenue(p_month INT, p_year INT)
RETURNS DECIMAL(10,2)
READS SQL DATA
BEGIN
    DECLARE v_total_revenue DECIMAL(10,2);
    DECLARE v_month_start DATE;
    DECLARE v_month_end DATE;
    
    -- A subscription counts if it overlaps any day of the month.
    SET v_month_start = MAKEDATE(p_year, 1) + INTERVAL (p_month - 1) MONTH;
    SET v_month_end = LAST_DAY(v_month_start);
    
    SELECT COALESCE(SUM(s.price), 0) INTO v_total_revenue
    FROM UserSubscription us
    INNER JOIN Subscription s ON us.subscription_id = s.subscription_id
    WHERE us.start_date <= v_month_end
    AND (us.end_date IS NULL OR us.end_date >= v_month_start)
    AND us.status = 'active';
    
    RETURN v_total_revenue;
END//

DROP FUNCTION IF EXISTS GetPlaylistDuration//
CREATE FUNCTION GetPlaylistDuration(p_playlist_id BIGINT)
RETURNS VARCHAR(20)
READS SQL DATA
BEGIN
    DECLARE v_total_seconds INT;
    
    SELECT COALESCE(SUM(t.duration_seconds), 0) INTO v_total_seconds
    FROM PlaylistTrack pt
    INNER JOIN Track t ON pt.track_id = t.track_id
    WHERE pt.playlist_id = p_playlist_id;
    
    RETURN FormatDuration(v_total_seconds);
END//

DELIMITER ;


DROP VIEW IF EXISTS ArtistDashboard;
CREATE VIEW ArtistDashboard AS
SELECT 
    ar.artist_id,
    ar.artist_name,
    ar.is_verified,
    ar.monthly_listeners,
    COUNT(DISTINCT al.album_id)           AS total_albums,
    COUNT(DISTINCT t.track_id)            AS total_tracks,
    COALESCE(SUM(t.play_count), 0)        AS total_plays,
    COALESCE(AVG(t.play_count), 0)        AS avg_plays_per_track,
    COUNT(DISTINCT uf.follower_id)        AS follower_count
FROM Artist ar
LEFT JOIN Album al ON ar.artist_id = al.artist_id
LEFT JOIN Track t ON al.album_id = t.album_id
LEFT JOIN UserFollowing uf
      ON ar.artist_id = uf.following_id
     AND uf.following_type = 'artist'
GROUP BY ar.artist_id;

DROP VIEW IF EXISTS PopularPlaylists;
CREATE VIEW PopularPlaylists AS
SELECT 
    p.playlist_id,
    p.playlist_name,
    u.username as creator,
    p.is_public,
    p.follower_count,
    COUNT(DISTINCT pt.track_id) as track_count,
    GetPlaylistDuration(p.playlist_id) as total_duration,
    p.created_at,
    p.updated_at
FROM Playlist p
INNER JOIN `User` u ON p.created_by = u.user_id
LEFT JOIN PlaylistTrack pt ON p.playlist_id = pt.playlist_id
WHERE p.is_public = TRUE
GROUP BY p.playlist_id
ORDER BY p.follower_count DESC;

DROP VIEW IF EXISTS TrackPerformance;
CREATE VIEW TrackPerformance AS
SELECT 
    t.track_id,
    t.track_title,
    ar.artist_name,
    al.album_title,
    g.genre_name,
    t.play_count,
    t.trending_score,
    COUNT(DISTINCT lh.user_id) as unique_listeners,
    COUNT(DISTINCT uf.user_id) as times_favorited,
    COUNT(DISTINCT pt.playlist_id) as playlist_inclusions,
    FormatDuration(t.duration_seconds) as duration
FROM Track t
INNER JOIN Album al ON t.album_id = al.album_id
INNER JOIN Artist ar ON al.artist_id = ar.artist_id
LEFT JOIN Genre g ON al.genre_id = g.genre_id
LEFT JOIN ListeningHistory lh ON t.track_id = lh.track_id
LEFT JOIN UserFavorites uf ON t.track_id = uf.track_id
LEFT JOIN PlaylistTrack pt ON t.track_id = pt.track_id
GROUP BY t.track_id;

-- ============================================================
-- INSERT SAMPLE DATA (your provided full INSERTs)
-- ============================================================

-- Insert Genres
INSERT INTO Genre (genre_name, description) VALUES
('Pop', 'Popular music characterized by catchy melodies'),
('Rock', 'Music with strong beat and electric guitars'),
('Hip Hop', 'Urban music with rhythmic speech'),
('Electronic', 'Music produced using electronic instruments'),
('Classical', 'Traditional orchestral music'),
('Jazz', 'Improvisational music with complex harmonies'),
('Country', 'American roots music'),
('R&B', 'Rhythm and blues music'),
('Metal', 'Heavy and aggressive rock music'),
('Indie', 'Independent artist music');

-- Insert Subscriptions
INSERT INTO Subscription (plan_name, price, duration_days, download_limit, ad_free, high_quality, offline_mode, max_devices, description) VALUES
('Free', 0.00, 0, 0, FALSE, FALSE, FALSE, 1, 'Basic free plan with ads'),
('Basic', 4.99, 30, 10, TRUE, FALSE, TRUE, 1, 'Ad-free music with limited downloads'),
('Premium', 9.99, 30, 100, TRUE, TRUE, TRUE, 3, 'High quality streaming with downloads'),
('Family', 14.99, 30, 500, TRUE, TRUE, TRUE, 6, 'Share with up to 6 family members'),
('Student', 2.99, 30, 50, TRUE, TRUE, TRUE, 1, 'Discounted plan for students');

-- Insert Users (demo password for every account: vamusic)
INSERT INTO User (username, email, password, first_name, last_name, country, date_of_birth) VALUES
('john_doe', 'john@email.com', '$2b$10$6AtWjXy/NqMndHGSK72jZuD6pzM5UO7enO6Cwi3VQXtK7zq/b2/Sa', 'John', 'Doe', 'US', '1990-05-15'),
('jane_smith', 'jane@email.com', '$2b$10$6AtWjXy/NqMndHGSK72jZuD6pzM5UO7enO6Cwi3VQXtK7zq/b2/Sa', 'Jane', 'Smith', 'GB', '1992-08-22'),
('mike_wilson', 'mike@email.com', '$2b$10$6AtWjXy/NqMndHGSK72jZuD6pzM5UO7enO6Cwi3VQXtK7zq/b2/Sa', 'Mike', 'Wilson', 'CA', '1988-03-10'),
('sarah_jones', 'sarah@email.com', '$2b$10$6AtWjXy/NqMndHGSK72jZuD6pzM5UO7enO6Cwi3VQXtK7zq/b2/Sa', 'Sarah', 'Jones', 'AU', '1995-11-28'),
('alex_brown', 'alex@email.com', '$2b$10$6AtWjXy/NqMndHGSK72jZuD6pzM5UO7enO6Cwi3VQXtK7zq/b2/Sa', 'Alex', 'Brown', 'IN', '1993-07-04'),
('emma_davis', 'emma@email.com', '$2b$10$6AtWjXy/NqMndHGSK72jZuD6pzM5UO7enO6Cwi3VQXtK7zq/b2/Sa', 'Emma', 'Davis', 'US', '1991-12-18'),
('chris_lee', 'chris@email.com', '$2b$10$6AtWjXy/NqMndHGSK72jZuD6pzM5UO7enO6Cwi3VQXtK7zq/b2/Sa', 'Chris', 'Lee', 'SG', '1994-09-30'),
('lisa_martin', 'lisa@email.com', '$2b$10$6AtWjXy/NqMndHGSK72jZuD6pzM5UO7enO6Cwi3VQXtK7zq/b2/Sa', 'Lisa', 'Martin', 'FR', '1989-06-12'),
('david_garcia', 'david@email.com', '$2b$10$6AtWjXy/NqMndHGSK72jZuD6pzM5UO7enO6Cwi3VQXtK7zq/b2/Sa', 'David', 'Garcia', 'ES', '1996-02-25'),
('amy_taylor', 'amy@email.com', '$2b$10$6AtWjXy/NqMndHGSK72jZuD6pzM5UO7enO6Cwi3VQXtK7zq/b2/Sa', 'Amy', 'Taylor', 'DE', '1990-10-08');

-- Insert User Subscriptions
INSERT INTO UserSubscription (user_id, subscription_id, start_date, status) VALUES
(1, 3, '2024-01-01', 'active'),
(2, 2, '2024-02-15', 'active'),
(3, 4, '2024-01-20', 'active'),
(4, 5, '2024-03-01', 'active'),
(5, 1, '2024-01-01', 'active'),
(6, 3, '2024-02-10', 'active'),
(7, 2, '2024-03-15', 'active'),
(8, 3, '2024-01-25', 'active'),
(9, 1, '2024-02-01', 'active'),
(10, 4, '2024-03-10', 'active');

-- Insert Artists
INSERT INTO Artist (artist_name, bio, country, is_verified, monthly_listeners) VALUES
('The Melodics', 'Indie rock band from Seattle', 'US', TRUE, 250000),
('Luna Rose', 'Pop sensation with chart-topping hits', 'GB', TRUE, 1500000),
('DJ Electron', 'Electronic music producer', 'DE', TRUE, 800000),
('Jazz Quartet', 'Traditional jazz ensemble', 'US', FALSE, 50000),
('Metal Force', 'Heavy metal band', 'FI', TRUE, 300000),
('Country Roads', 'Authentic country music', 'US', TRUE, 450000),
('Hip Hop Collective', 'Urban music group', 'US', TRUE, 900000),
('Classical Symphony', 'Orchestra performing classical pieces', 'AT', TRUE, 100000),
('R&B Soul', 'Smooth R&B vocals', 'US', TRUE, 600000),
('Indie Dreams', 'Independent artist collective', 'CA', FALSE, 75000);

-- Insert Albums
INSERT INTO Album (album_title, artist_id, release_date, album_type, genre_id, record_label) VALUES
('Echoes of Tomorrow', 1, '2024-01-15', 'album', 2, 'Indie Records'),
('Pop Paradise', 2, '2024-02-01', 'album', 1, 'Major Label'),
('Electronic Nights', 3, '2024-01-20', 'album', 4, 'Beat Records'),
('Jazz Standards', 4, '2023-12-10', 'album', 6, 'Jazz House'),
('Metal Mayhem', 5, '2024-02-15', 'album', 9, 'Heavy Records'),
('Country Tales', 6, '2024-01-05', 'album', 7, 'Nashville Prod'),
('Urban Beats', 7, '2024-02-20', 'album', 3, 'Street Records'),
('Classical Masterpieces', 8, '2023-11-30', 'compilation', 5, 'Classical Co'),
('Smooth Grooves', 9, '2024-01-25', 'album', 8, 'Soul Records'),
('Indie Collection', 10, '2024-02-10', 'EP', 10, 'DIY Records');

-- Insert Tracks (10 tracks per album = 100 tracks)
-- Note: file_path would be actual audio file locations in production
INSERT INTO Track (track_title, album_id, duration_seconds, track_number, file_path, is_explicit) VALUES
-- Album 1
('Morning Light', 1, 210, 1, '/audio/album1/track1.mp3', FALSE),
('City Dreams', 1, 195, 2, '/audio/album1/track2.mp3', FALSE),
('Midnight Train', 1, 240, 3, '/audio/album1/track3.mp3', FALSE),
('Lost in Time', 1, 180, 4, '/audio/album1/track4.mp3', FALSE),
('Summer Breeze', 1, 200, 5, '/audio/album1/track5.mp3', FALSE),
('Rainbow Road', 1, 220, 6, '/audio/album1/track6.mp3', FALSE),
('Ocean Waves', 1, 190, 7, '/audio/album1/track7.mp3', FALSE),
('Mountain High', 1, 205, 8, '/audio/album1/track8.mp3', FALSE),
('Desert Sun', 1, 215, 9, '/audio/album1/track9.mp3', FALSE),
('Northern Lights', 1, 230, 10, '/audio/album1/track10.mp3', FALSE),

-- Album 2
('Dance Tonight', 2, 180, 1, '/audio/album2/track1.mp3', FALSE),
('Love Story', 2, 200, 2, '/audio/album2/track2.mp3', FALSE),
('Party Time', 2, 175, 3, '/audio/album2/track3.mp3', TRUE),
('Hearts Unite', 2, 210, 4, '/audio/album2/track4.mp3', FALSE),
('Summer Love', 2, 195, 5, '/audio/album2/track5.mp3', FALSE),
('Night Out', 2, 185, 6, '/audio/album2/track6.mp3', TRUE),
('Dream Big', 2, 205, 7, '/audio/album2/track7.mp3', FALSE),
('Forever Young', 2, 190, 8, '/audio/album2/track8.mp3', FALSE),
('Shine Bright', 2, 200, 9, '/audio/album2/track9.mp3', FALSE),
('One More Time', 2, 220, 10, '/audio/album2/track10.mp3', FALSE),

-- Album 3
('Beat Drop', 3, 240, 1, '/audio/album3/track1.mp3', FALSE),
('Synth Wave', 3, 255, 2, '/audio/album3/track2.mp3', FALSE),
('Digital Love', 3, 220, 3, '/audio/album3/track3.mp3', FALSE),
('Neon Nights', 3, 235, 4, '/audio/album3/track4.mp3', FALSE),
('Future Sound', 3, 245, 5, '/audio/album3/track5.mp3', FALSE),
('Bass Line', 3, 210, 6, '/audio/album3/track6.mp3', FALSE),
('Cyber Dream', 3, 260, 7, '/audio/album3/track7.mp3', FALSE),
('Tech House', 3, 225, 8, '/audio/album3/track8.mp3', FALSE),
('Electronic Soul', 3, 230, 9, '/audio/album3/track9.mp3', FALSE),
('Midnight Rave', 3, 250, 10, '/audio/album3/track10.mp3', TRUE),

-- Album 4
('Blue Moon', 4, 300, 1, '/audio/album4/track1.mp3', FALSE),
('Swing Time', 4, 280, 2, '/audio/album4/track2.mp3', FALSE),
('Jazz Cafe', 4, 320, 3, '/audio/album4/track3.mp3', FALSE),
('Smooth Jazz', 4, 290, 4, '/audio/album4/track4.mp3', FALSE),
('Night Jazz', 4, 310, 5, '/audio/album4/track5.mp3', FALSE),
('Bebop Blues', 4, 275, 6, '/audio/album4/track6.mp3', FALSE),
('Jazz Fusion', 4, 330, 7, '/audio/album4/track7.mp3', FALSE),
('Saxophone Solo', 4, 295, 8, '/audio/album4/track8.mp3', FALSE),
('Piano Jazz', 4, 305, 9, '/audio/album4/track9.mp3', FALSE),
('Jazz Ensemble', 4, 340, 10, '/audio/album4/track10.mp3', FALSE),

-- Album 5
('Thunder Strike', 5, 280, 1, '/audio/album5/track1.mp3', TRUE),
('Iron Fist', 5, 265, 2, '/audio/album5/track2.mp3', TRUE),
('Metal Heart', 5, 290, 3, '/audio/album5/track3.mp3', TRUE),
('Rage Mode', 5, 255, 4, '/audio/album5/track4.mp3', TRUE),
('Dark Knight', 5, 300, 5, '/audio/album5/track5.mp3', TRUE),
('Steel Thunder', 5, 270, 6, '/audio/album5/track6.mp3', TRUE),
('Power Surge', 5, 285, 7, '/audio/album5/track7.mp3', TRUE),
('Metal Warrior', 5, 275, 8, '/audio/album5/track8.mp3', TRUE),
('Doom Day', 5, 295, 9, '/audio/album5/track9.mp3', TRUE),
('Final Battle', 5, 310, 10, '/audio/album5/track10.mp3', TRUE),

-- Album 6
('Country Road', 6, 200, 1, '/audio/album6/track1.mp3', FALSE),
('Farm Life', 6, 210, 2, '/audio/album6/track2.mp3', FALSE),
('Whiskey Night', 6, 195, 3, '/audio/album6/track3.mp3', FALSE),
('Truck Song', 6, 205, 4, '/audio/album6/track4.mp3', FALSE),
('Southern Belle', 6, 190, 5, '/audio/album6/track5.mp3', FALSE),
('Barn Dance', 6, 215, 6, '/audio/album6/track6.mp3', FALSE),
('Country Love', 6, 200, 7, '/audio/album6/track7.mp3', FALSE),
('Cowboy Life', 6, 210, 8, '/audio/album6/track8.mp3', FALSE),
('Nashville Nights', 6, 195, 9, '/audio/album6/track9.mp3', FALSE),
('Home Sweet Home', 6, 220, 10, '/audio/album6/track10.mp3', FALSE),

-- Album 7
('Street Life', 7, 195, 1, '/audio/album7/track1.mp3', TRUE),
('Hip Hop Nation', 7, 185, 2, '/audio/album7/track2.mp3', TRUE),
('Urban Legend', 7, 200, 3, '/audio/album7/track3.mp3', TRUE),
('City Lights', 7, 190, 4, '/audio/album7/track4.mp3', FALSE),
('Block Party', 7, 180, 5, '/audio/album7/track5.mp3', TRUE),
('Rap Battle', 7, 210, 6, '/audio/album7/track6.mp3', TRUE),
('Street Dreams', 7, 195, 7, '/audio/album7/track7.mp3', FALSE),
('Urban Flow', 7, 185, 8, '/audio/album7/track8.mp3', TRUE),
('City Vibes', 7, 200, 9, '/audio/album7/track9.mp3', FALSE),
('Hip Hop Life', 7, 205, 10, '/audio/album7/track10.mp3', TRUE),

-- Album 8
('Symphony No. 1', 8, 480, 1, '/audio/album8/track1.mp3', FALSE),
('Concerto in D', 8, 420, 2, '/audio/album8/track2.mp3', FALSE),
('Orchestral Suite', 8, 540, 3, '/audio/album8/track3.mp3', FALSE),
('Piano Sonata', 8, 360, 4, '/audio/album8/track4.mp3', FALSE),
('String Quartet', 8, 390, 5, '/audio/album8/track5.mp3', FALSE),
('Opera Aria', 8, 300, 6, '/audio/album8/track6.mp3', FALSE),
('Chamber Music', 8, 450, 7, '/audio/album8/track7.mp3', FALSE),
('Violin Concerto', 8, 510, 8, '/audio/album8/track8.mp3', FALSE),
('Classical Piece', 8, 375, 9, '/audio/album8/track9.mp3', FALSE),
('Grand Finale', 8, 600, 10, '/audio/album8/track10.mp3', FALSE),

-- Album 9
('Smooth Operator', 9, 225, 1, '/audio/album9/track1.mp3', FALSE),
('Soul Sister', 9, 210, 2, '/audio/album9/track2.mp3', FALSE),
('R&B Love', 9, 235, 3, '/audio/album9/track3.mp3', FALSE),
('Groove Tonight', 9, 200, 4, '/audio/album9/track4.mp3', FALSE),
('Soulful Voice', 9, 220, 5, '/audio/album9/track5.mp3', FALSE),
('Rhythm Blues', 9, 215, 6, '/audio/album9/track6.mp3', FALSE),
('Love Ballad', 9, 245, 7, '/audio/album9/track7.mp3', FALSE),
('Soul Train', 9, 205, 8, '/audio/album9/track8.mp3', FALSE),
('R&B Classic', 9, 230, 9, '/audio/album9/track9.mp3', FALSE),
('Smooth Ending', 9, 250, 10, '/audio/album9/track10.mp3', FALSE),

-- Album 10
('Indie Anthem', 10, 190, 1, '/audio/album10/track1.mp3', FALSE),
('DIY Spirit', 10, 175, 2, '/audio/album10/track2.mp3', FALSE),
('Underground', 10, 200, 3, '/audio/album10/track3.mp3', FALSE),
('Indie Rock', 10, 185, 4, '/audio/album10/track4.mp3', FALSE),
('Alternative', 10, 195, 5, '/audio/album10/track5.mp3', FALSE);

-- Insert Playlists
INSERT INTO Playlist (playlist_name, created_by, description, is_public) VALUES
('My Favorites', 1, 'Collection of my favorite tracks', TRUE),
('Workout Mix', 2, 'High energy songs for gym', TRUE),
('Study Music', 3, 'Calm music for concentration', TRUE),
('Party Playlist', 4, 'Best party tracks', TRUE),
('Chill Vibes', 5, 'Relaxing music', TRUE),
('Road Trip', 6, 'Perfect for long drives', TRUE),
('Morning Coffee', 7, 'Start your day right', TRUE),
('Sleep Sounds', 8, 'Peaceful sleep music', FALSE),
('Throwback Hits', 9, 'Classic favorites', TRUE),
('Discover Weekly', 10, 'New music discoveries', TRUE);

-- Insert some playlist tracks
INSERT INTO PlaylistTrack (playlist_id, track_id, position, added_by) VALUES
(1, 1, 1, 1), (1, 11, 2, 1), (1, 21, 3, 1), (1, 31, 4, 1), (1, 41, 5, 1),
(2, 51, 1, 2), (2, 52, 2, 2), (2, 53, 3, 2), (2, 54, 4, 2), (2, 55, 5, 2),
(3, 31, 1, 3), (3, 32, 2, 3), (3, 33, 3, 3), (3, 34, 4, 3), (3, 35, 5, 3),
(4, 11, 1, 4), (4, 12, 2, 4), (4, 13, 3, 4), (4, 61, 4, 4), (4, 62, 5, 4),
(5, 81, 1, 5), (5, 82, 2, 5), (5, 83, 3, 5), (5, 84, 4, 5), (5, 85, 5, 5);

-- Insert user playlist relationships
INSERT INTO UserPlaylist (user_id, playlist_id, is_owner) VALUES
(1, 1, TRUE), (2, 2, TRUE), (3, 3, TRUE), (4, 4, TRUE), (5, 5, TRUE),
(6, 6, TRUE), (7, 7, TRUE), (8, 8, TRUE), (9, 9, TRUE), (10, 10, TRUE),
(1, 2, FALSE), (2, 3, FALSE), (3, 4, FALSE), (4, 5, FALSE), (5, 1, FALSE);

-- Insert some listening history
INSERT INTO ListeningHistory (user_id, track_id, playback_duration, device_type, streaming_quality, completed) VALUES
(1, 1, 210, 'web', 'high', TRUE),
(1, 2, 195, 'mobile', 'medium', TRUE),
(1, 11, 180, 'web', 'high', TRUE),
(2, 21, 240, 'mobile', 'high', TRUE),
(2, 22, 255, 'desktop', 'lossless', TRUE),
(3, 31, 300, 'web', 'medium', TRUE),
(3, 32, 280, 'mobile', 'low', TRUE),
(4, 41, 280, 'mobile', 'high', TRUE),
(5, 51, 200, 'web', 'high', TRUE),
(6, 61, 195, 'mobile', 'medium', TRUE);

-- Insert user favorites
INSERT INTO UserFavorites (user_id, track_id) VALUES
(1, 1), (1, 11), (1, 21),
(2, 12), (2, 22), (2, 32),
(3, 31), (3, 41), (3, 51),
(4, 14), (4, 24), (4, 34),
(5, 15), (5, 25), (5, 35);

-- Insert user following relationships
INSERT INTO UserFollowing (follower_id, following_id, following_type) VALUES
(1, 2, 'artist'), (1, 3, 'artist'),
(2, 1, 'artist'), (2, 4, 'artist'),
(3, 5, 'artist'), (3, 6, 'artist'),
(4, 1, 'user'), (4, 2, 'user'),
(5, 3, 'user'), (5, 4, 'user');

-- Insert track artists (for collaborations)
INSERT INTO TrackArtist (track_id, artist_id, role) VALUES
(1, 1, 'primary'),
(11, 2, 'primary'),
(12, 2, 'featured'),
(21, 3, 'primary'),
(31, 4, 'primary');

-- ============================================================
-- Reset AUTO_INCREMENTs to max(existing)+1 (prevents collisions)
-- ============================================================

SET @t = (SELECT COALESCE(MAX(user_id),0) FROM `User`); SET @t = @t + 1; SET @s = CONCAT('ALTER TABLE `User` AUTO_INCREMENT=', @t); PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @t = (SELECT COALESCE(MAX(artist_id),0) FROM Artist); SET @t = @t + 1; SET @s = CONCAT('ALTER TABLE Artist AUTO_INCREMENT=', @t); PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @t = (SELECT COALESCE(MAX(album_id),0) FROM Album); SET @t = @t + 1; SET @s = CONCAT('ALTER TABLE Album AUTO_INCREMENT=', @t); PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @t = (SELECT COALESCE(MAX(track_id),0) FROM Track); SET @t = @t + 1; SET @s = CONCAT('ALTER TABLE Track AUTO_INCREMENT=', @t); PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @t = (SELECT COALESCE(MAX(playlist_id),0) FROM Playlist); SET @t = @t + 1; SET @s = CONCAT('ALTER TABLE Playlist AUTO_INCREMENT=', @t); PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- re-enable FK checks
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- DISPLAY SUMMARY
-- ============================================================

SELECT 'Database created successfully!' as Status;
SELECT 'Tables created:' as Summary, COUNT(*) as Count FROM information_schema.tables WHERE table_schema = 'vamusic';
SELECT 'Sample data inserted - Users:' as DataType, COUNT(*) as Count FROM `User`
UNION SELECT 'Sample data inserted - Artists:', COUNT(*) FROM Artist
UNION SELECT 'Sample data inserted - Albums:', COUNT(*) FROM Album
UNION SELECT 'Sample data inserted - Tracks:', COUNT(*) FROM Track
UNION SELECT 'Sample data inserted - Playlists:', COUNT(*) FROM Playlist;
