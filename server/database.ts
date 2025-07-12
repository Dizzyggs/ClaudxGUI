import sqlite3 from 'sqlite3';
import { Database } from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'data', 'claudxgui.db');
console.log('Database path:', DB_PATH);

// Ensure data directory exists
const DATA_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('Created data directory:', DATA_DIR);
}

export interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Message {
  id: string;
  projectId: string;
  sender: 'user' | 'claude';
  text: string;
  createdAt: string;
}

export interface ImageFile {
  id: string;
  projectId: string;
  messageId?: string;
  filename: string;
  filepath: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

class DatabaseManager {
  private db: Database;
  private initialized: boolean = false;

  constructor() {
    this.db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err);
      } else {
        console.log('Database connected successfully');
        this.initializeDatabase();
      }
    });
  }

  private initializeDatabase(): void {
    // Create projects table first
    this.db.run(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT
      )
    `, (err) => {
      if (err) {
        console.error('Error creating projects table:', err);
        return;
      }
      console.log('Projects table created/verified');
      
      // Add updatedAt column if it doesn't exist (migration)
      this.db.run(`
        ALTER TABLE projects ADD COLUMN updatedAt TEXT
      `, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.error('Error adding updatedAt column:', err);
        } else {
          console.log('UpdatedAt column added/verified');
        }
      });
      
      // Create messages table after projects
      this.db.run(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          projectId TEXT NOT NULL,
          sender TEXT NOT NULL CHECK (sender IN ('user', 'claude')),
          text TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          FOREIGN KEY (projectId) REFERENCES projects (id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) {
          console.error('Error creating messages table:', err);
          return;
        }
        console.log('Messages table created/verified');
        
        // Create images table after messages
        this.db.run(`
          CREATE TABLE IF NOT EXISTS images (
            id TEXT PRIMARY KEY,
            projectId TEXT NOT NULL,
            messageId TEXT,
            filename TEXT NOT NULL,
            filepath TEXT NOT NULL,
            mimeType TEXT NOT NULL,
            size INTEGER NOT NULL,
            createdAt TEXT NOT NULL,
            FOREIGN KEY (projectId) REFERENCES projects (id) ON DELETE CASCADE,
            FOREIGN KEY (messageId) REFERENCES messages (id) ON DELETE SET NULL
          )
        `, (err) => {
          if (err) {
            console.error('Error creating images table:', err);
            return;
          }
          console.log('Images table created/verified');
          
          // Create message index after tables
          this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_messages_project_created 
            ON messages (projectId, createdAt)
          `, (err) => {
            if (err) {
              console.error('Error creating messages index:', err);
              return;
            }
            console.log('Messages index created/verified');
            
            // Create images index last
            this.db.run(`
              CREATE INDEX IF NOT EXISTS idx_images_project_created 
              ON images (projectId, createdAt)
            `, (err) => {
              if (err) {
                console.error('Error creating images index:', err);
                return;
              }
              console.log('Images index created/verified');
              this.initialized = true;
            });
          });
        });
      });
    });
  }

  // Project operations
  async createProject(project: Project): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO projects (id, name, path, createdAt) VALUES (?, ?, ?, ?)',
        [project.id, project.name, project.path, project.createdAt],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getAllProjects(): Promise<Project[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM projects ORDER BY createdAt DESC',
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows as Project[]);
        }
      );
    });
  }

  async getProject(id: string): Promise<Project | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM projects WHERE id = ?',
        [id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row as Project || null);
        }
      );
    });
  }

  async updateProject(id: string, project: Project): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('Updating project with data:', { id, name: project.name, path: project.path });
      this.db.run(
        'UPDATE projects SET name = ?, path = ?, updatedAt = ? WHERE id = ?',
        [project.name, project.path, project.updatedAt || new Date().toISOString(), id],
        function(err) {
          if (err) {
            console.error('Database update error:', err);
            reject(err);
          } else {
            console.log('Project updated successfully, changes:', this.changes);
            if (this.changes === 0) {
              reject(new Error('No project found with the given ID'));
            } else {
              resolve();
            }
          }
        }
      );
    });
  }

  async deleteProject(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM projects WHERE id = ?',
        [id],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Message operations
  async saveMessage(message: Message): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO messages (id, projectId, sender, text, createdAt) VALUES (?, ?, ?, ?, ?)',
        [message.id, message.projectId, message.sender, message.text, message.createdAt],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getProjectMessages(projectId: string): Promise<Message[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM messages WHERE projectId = ? ORDER BY createdAt ASC',
        [projectId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows as Message[]);
        }
      );
    });
  }

  async deleteProjectMessages(projectId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM messages WHERE projectId = ?',
        [projectId],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getMessageCount(projectId: string): Promise<number> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT COUNT(*) as count FROM messages WHERE projectId = ?',
        [projectId],
        (err, row: any) => {
          if (err) reject(err);
          else resolve(row.count);
        }
      );
    });
  }

  // Cleanup old messages (optional - keep only last N messages per project)
  async cleanupOldMessages(projectId: string, keepCount: number = 1000): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(`
        DELETE FROM messages 
        WHERE projectId = ? 
        AND id NOT IN (
          SELECT id FROM messages 
          WHERE projectId = ? 
          ORDER BY createdAt DESC 
          LIMIT ?
        )
      `, [projectId, projectId, keepCount], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Image operations
  async saveImage(image: ImageFile): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO images (id, projectId, messageId, filename, filepath, mimeType, size, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [image.id, image.projectId, image.messageId, image.filename, image.filepath, image.mimeType, image.size, image.createdAt],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async linkImageToMessage(imageId: string, messageId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE images SET messageId = ? WHERE id = ?',
        [messageId, imageId],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getMessageImages(messageId: string): Promise<ImageFile[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM images WHERE messageId = ? ORDER BY createdAt ASC',
        [messageId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows as ImageFile[]);
        }
      );
    });
  }

  async getProjectImages(projectId: string): Promise<ImageFile[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM images WHERE projectId = ? ORDER BY createdAt DESC',
        [projectId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows as ImageFile[]);
        }
      );
    });
  }

  async getImage(imageId: string): Promise<ImageFile | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM images WHERE id = ?',
        [imageId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row as ImageFile || null);
        }
      );
    });
  }

  async deleteImage(imageId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM images WHERE id = ?',
        [imageId],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async deleteProjectImages(projectId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM images WHERE projectId = ?',
        [projectId],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Wait for database to be initialized
  async waitForInitialization(): Promise<void> {
    return new Promise((resolve) => {
      const checkInitialized = () => {
        if (this.initialized) {
          resolve();
        } else {
          setTimeout(checkInitialized, 100);
        }
      };
      checkInitialized();
    });
  }

  // Close database connection
  close(): void {
    this.db.close();
  }
}

// Export singleton instance
export const db = new DatabaseManager();