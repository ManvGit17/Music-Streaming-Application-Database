# VaMusic Database Application

A desktop application (using Python/Tkinter) built around a **MySQL/MariaDB database** for managing a simplified music streaming service's catalog and user interactions.

This project demonstrates database design (schema creation, foreign keys, indexing) and basic CRUD (Create, Read, Update, Delete) operations using Python's `mysql-connector-python` library.

## ✨ Features

* **User Interface (`vamusic_user_ui.py`):**
    * User registration and secure login using **bcrypt** password hashing.
    * Browse and search music tracks.
    * User library management (Like/Unlike tracks, Follow/Unfollow Artists).
    * Create and manage custom playlists.
* **Admin Interface (`vamusic_admin_ui.py`):
    * Basic CRUD operations for managing Users, Artists, Albums, Tracks, and Playlists.
* **Database Schema:**
    * Designed for a music service with tables for Users, Artists, Albums, Tracks, Playlists, Genres, and Subscriptions.

## 📦 Project Structure

| File | Description |
| :--- | :--- |
| `vamusic_user_ui.py` | The main user application interface (Tkinter). |
| `vamusic_admin_ui.py` | The administration interface (Tkinter) for data management. |
| `db_utils.py` | Shared Python module containing database connection logic, configuration (`DB_CONFIG`), and password hashing utilities. |
| `vamusic_v2.sql` | The complete MySQL/MariaDB database schema (`CREATE TABLE`s, and sample `INSERT` data). **Use this to set up the DB.** |
| `create_helper_tables.py`| Utility script to create additional relational/junction tables like `UserLikedTrack` and `UserFollowArtist`. |
| `vamusic_ERDiagram.jpg` | The Entity-Relationship Diagram for the database schema. |

## ⚙️ Setup and Installation

### Prerequisites

1.  **Python 3**
2.  **MySQL/MariaDB Server**
3.  **Required Python Packages:**
    ```bash
    pip install mysql-connector-python bcrypt pillow
    ```

### Database Setup

1.  **Configure Credentials:** Open `db_utils.py` and update the `DB_CONFIG` dictionary to match your MySQL server credentials.
2.  **Create and Populate Database:** Execute the SQL script on your server:
    ```bash
    # Run from your terminal if mysql is in your path
    mysql -u root -p < vamusic_v2.sql
    ```

### Running the Application

```bash
# Run the user interface
python vamusic_user_ui.py

# Run the admin interface
python vamusic_admin_ui.py
