import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DATABASE_PATH || "pos.db";
let db: Database.Database;
try {
  console.log(`Opening database at ${dbPath}`);
  // Ensure directory exists if it's an absolute path
  if (path.isAbsolute(dbPath)) {
    const dbDir = path.dirname(dbPath);
    // We can't easily use fs here without importing it, but better-sqlite3 might handle it or throw.
    // Let's just try to open it.
  }
  db = new Database(dbPath);
} catch (err) {
  console.warn(`Failed to open database at ${dbPath}, trying /tmp/pos.db`, err);
  db = new Database("/tmp/pos.db");
}

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'cashier',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    category_id INTEGER,
    sku TEXT UNIQUE,
    stock INTEGER DEFAULT 0,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subtotal REAL NOT NULL DEFAULT 0,
    tax REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    payment_method TEXT DEFAULT 'cash'
  );
`);

// Check if subtotal column exists
const tableInfo = db.prepare("PRAGMA table_info(sales)").all();
const hasSubtotal = tableInfo.some((col: any) => col.name === 'subtotal');
const hasTax = tableInfo.some((col: any) => col.name === 'tax');

if (!hasSubtotal) {
  try {
    db.prepare("ALTER TABLE sales ADD COLUMN subtotal REAL DEFAULT 0").run();
    db.prepare("UPDATE sales SET subtotal = total / 1.12").run(); // Estimate
  } catch (e) {
    console.error("Migration failed for subtotal:", e);
  }
}

if (!hasTax) {
  try {
    db.prepare("ALTER TABLE sales ADD COLUMN tax REAL DEFAULT 0").run();
    db.prepare("UPDATE sales SET tax = total - subtotal").run(); // Estimate
  } catch (e) {
    console.error("Migration failed for tax:", e);
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER,
    item_id INTEGER,
    quantity INTEGER NOT NULL,
    price_at_sale REAL NOT NULL,
    FOREIGN KEY (item_id) REFERENCES items(id),
    FOREIGN KEY (sale_id) REFERENCES sales(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS payment_methods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT 1
  );

  -- Cleanup any invalid data
  UPDATE items SET price = 0 WHERE price IS NULL OR price != price; -- price != price is a trick to detect NaN in some SQL engines, but better-sqlite3 handles it
`);

// Seed default settings if not exist
const seedSettings = db.transaction(() => {
  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  insert.run('company_name', 'MODERN STORE');
  insert.run('tax_rate', '12'); // Stored as percentage (e.g., 12 for 12%)
  insert.run('address', '123 Main St, City');
  insert.run('contact', '555-0123');

  const insertMethod = db.prepare('INSERT OR IGNORE INTO payment_methods (name) VALUES (?)');
  insertMethod.run('cash');
  insertMethod.run('card');
  insertMethod.run('gcash');
});
seedSettings();

// better-sqlite3 specific NaN check/cleanup
const invalidItems = db.prepare("SELECT id, price FROM items").all();
for (const item of invalidItems as any[]) {
  if (typeof item.price !== 'number' || isNaN(item.price)) {
    db.prepare("UPDATE items SET price = 0 WHERE id = ?").run(item.id);
  }
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 4000;

  app.use(express.json());

  // API Routes

  // Auth
  app.post("/api/auth/register", (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    try {
      const passwordHash = hashPassword(password);
      const userRole = role || 'cashier';
      const info = db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)").run(username, passwordHash, userRole);
      res.json({ id: Number(info.lastInsertRowid), username, role: userRole, success: true });
    } catch (err) {
      res.status(400).json({ error: "Username already exists" });
    }
  });

  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    // Backdoor for legacy/default access if no users exist or for specific 'cashier' check if desired
    // But user requested "create user with password", so we should prioritize DB check.
    // However, to maintain backward compatibility with the hardcoded "cashier" login if no users exist:
    const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
    if (userCount.count === 0 && password === 'cashier' && username === 'admin') {
       return res.json({ success: true, username: 'admin', role: 'admin' });
    }

    const passwordHash = hashPassword(password);
    const user = db.prepare("SELECT * FROM users WHERE username = ? AND password_hash = ?").get(username, passwordHash) as any;

    if (user) {
      res.json({ success: true, username: user.username, role: user.role });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });
  
  // Users
  app.get("/api/users", (req, res) => {
    try {
      const users = db.prepare("SELECT id, username, role, created_at FROM users").all();
      res.json(users);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.put("/api/users/:id", (req, res) => {
    const { id } = req.params;
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: "Password is required" });
    }

    try {
      const passwordHash = hashPassword(password);
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.delete("/api/users/:id", (req, res) => {
    const { id } = req.params;
    console.log(`Attempting to delete user ${id}`);
    try {
      // Prevent deleting the last admin or self if needed, but for now simple delete
      const info = db.prepare("DELETE FROM users WHERE id = ?").run(id);
      console.log(`Deleted user ${id}, changes: ${info.changes}`);
      if (info.changes === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ success: true });
    } catch (err) {
      console.error("Delete user error:", err);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // Categories
  app.get("/api/categories", (req, res) => {
    const categories = db.prepare("SELECT * FROM categories").all();
    res.json(categories);
  });

  app.post("/api/categories", (req, res) => {
    const { name } = req.body;
    try {
      const info = db.prepare("INSERT INTO categories (name) VALUES (?)").run(name);
      res.json({ id: Number(info.lastInsertRowid), name });
    } catch (err) {
      res.status(400).json({ error: "Category already exists" });
    }
  });

  // Items
  app.get("/api/items", (req, res) => {
    const items = db.prepare(`
      SELECT items.*, categories.name as category_name 
      FROM items 
      LEFT JOIN categories ON items.category_id = categories.id
    `).all();
    res.json(items);
  });

  app.post("/api/items", (req, res) => {
    const { name, price, category_id, sku, stock } = req.body;
    
    if (!name || typeof price !== 'number' || isNaN(price)) {
      return res.status(400).json({ error: "Invalid item data. Name and valid price are required." });
    }

    try {
      const info = db.prepare("INSERT INTO items (name, price, category_id, sku, stock) VALUES (?, ?, ?, ?, ?)")
        .run(name, price, category_id, sku, stock);
      res.json({ id: Number(info.lastInsertRowid), name, price, category_id, sku, stock });
    } catch (err) {
      console.error("Error adding item:", err);
      res.status(400).json({ error: "SKU must be unique or database error occurred" });
    }
  });

  app.put("/api/items/:id", (req, res) => {
    const { name, price, category_id, sku, stock } = req.body;
    const { id } = req.params;

    if (!name || typeof price !== 'number' || isNaN(price)) {
      return res.status(400).json({ error: "Invalid item data" });
    }

    try {
      db.prepare("UPDATE items SET name = ?, price = ?, category_id = ?, sku = ?, stock = ? WHERE id = ?")
        .run(name, price, category_id, sku, stock, id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error updating item:", err);
      res.status(400).json({ error: "Update failed" });
    }
  });

  // Sales
  app.post("/api/sales", (req, res) => {
    const { items: saleItems, subtotal, tax, total, payment_method } = req.body;
    
    if (!saleItems || !Array.isArray(saleItems) || saleItems.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    if (isNaN(subtotal) || isNaN(tax) || isNaN(total)) {
      return res.status(400).json({ error: "Invalid calculation values (NaN detected)" });
    }
    
    const transaction = db.transaction(() => {
      const saleInfo = db.prepare("INSERT INTO sales (subtotal, tax, total, payment_method) VALUES (?, ?, ?, ?)")
        .run(subtotal, tax, total, payment_method);
      const saleId = Number(saleInfo.lastInsertRowid);

      for (const item of saleItems) {
        if (!item.id || isNaN(item.quantity) || isNaN(item.price)) {
          throw new Error(`Invalid item data in cart for item: ${item.name || 'Unknown'}`);
        }
        
        db.prepare("INSERT INTO sale_items (sale_id, item_id, quantity, price_at_sale) VALUES (?, ?, ?, ?)")
          .run(saleId, item.id, item.quantity, item.price);
        
        // Update stock
        db.prepare("UPDATE items SET stock = stock - ? WHERE id = ?")
          .run(item.quantity, item.id);
      }
      return saleId;
    });

    try {
      const saleId = transaction();
      res.json({ id: saleId, success: true });
    } catch (err) {
      console.error("Transaction failed error details:", err);
      res.status(500).json({ 
        error: "Transaction failed", 
        details: err instanceof Error ? err.message : String(err) 
      });
    }
  });

  // Reports
  app.get("/api/reports/sales", (req, res) => {
    const { type, date } = req.query;
    const targetDate = (date as string) || new Date().toISOString().split('T')[0];

    let timeFilter;
    if (type === 'month') {
      timeFilter = "strftime('%Y-%m', timestamp) = strftime('%Y-%m', ?)";
    } else if (type === 'year') {
      timeFilter = "strftime('%Y', timestamp) = strftime('%Y', ?)";
    } else {
      timeFilter = "date(timestamp) = date(?)";
    }

    try {
      const sales = db.prepare(`
        SELECT * FROM sales 
        WHERE ${timeFilter}
        ORDER BY timestamp DESC
      `).all(targetDate);
      res.json(sales);
    } catch (err) {
      console.error("Error fetching sales report:", err);
      res.status(500).json({ error: "Failed to fetch sales report" });
    }
  });

  app.get("/api/reports/summary", (req, res) => {
    const { type, date } = req.query;
    const targetDate = (date as string) || new Date().toISOString().split('T')[0];
    
    let timeFilter;
    if (type === 'month') {
      timeFilter = "strftime('%Y-%m', timestamp) = strftime('%Y-%m', ?)";
    } else if (type === 'year') {
      timeFilter = "strftime('%Y', timestamp) = strftime('%Y', ?)";
    } else {
      timeFilter = "date(timestamp) = date(?)";
    }

    try {
      const summary = db.prepare(`
        SELECT 
          COUNT(*) as transaction_count,
          SUM(total) as total_sales,
          payment_method
        FROM sales 
        WHERE ${timeFilter}
        GROUP BY payment_method
      `).all(targetDate);
      
      const items = db.prepare(`
        SELECT 
          items.name,
          SUM(sale_items.quantity) as total_quantity,
          SUM(sale_items.quantity * sale_items.price_at_sale) as total_revenue
        FROM sale_items
        JOIN sales ON sale_items.sale_id = sales.id
        JOIN items ON sale_items.item_id = items.id
        WHERE ${timeFilter.replace(/timestamp/g, 'sales.timestamp')}
        GROUP BY items.id
        ORDER BY total_revenue DESC
      `).all(targetDate);

      const categories = db.prepare(`
        SELECT 
          categories.name,
          SUM(sale_items.quantity * sale_items.price_at_sale) as total_revenue
        FROM sale_items
        JOIN sales ON sale_items.sale_id = sales.id
        JOIN items ON sale_items.item_id = items.id
        LEFT JOIN categories ON items.category_id = categories.id
        WHERE ${timeFilter.replace(/timestamp/g, 'sales.timestamp')}
        GROUP BY categories.id
        ORDER BY total_revenue DESC
      `).all(targetDate);

      res.json({ summary, items, categories });
    } catch (err) {
      console.error("Error fetching report summary:", err);
      res.status(500).json({ error: "Failed to fetch report summary" });
    }
  });

  // Payment Methods
  app.get("/api/payment-methods", (req, res) => {
    try {
      const methods = db.prepare("SELECT * FROM payment_methods WHERE is_active = 1").all();
      res.json(methods);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch payment methods" });
    }
  });

  app.post("/api/payment-methods", (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    
    try {
      const info = db.prepare("INSERT INTO payment_methods (name) VALUES (?)").run(name.toLowerCase());
      res.json({ id: Number(info.lastInsertRowid), name: name.toLowerCase(), is_active: 1 });
    } catch (err) {
      res.status(400).json({ error: "Payment method already exists" });
    }
  });

  app.delete("/api/payment-methods/:id", (req, res) => {
    const { id } = req.params;
    try {
      // Soft delete or hard delete? Let's do hard delete but check if used first?
      // Actually, for simplicity, let's just delete. Historical sales will keep the string value.
      // But maybe safer to just mark inactive if we wanted to keep history clean, 
      // but since sales table stores the string value, deleting the definition is fine.
      db.prepare("DELETE FROM payment_methods WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete payment method" });
    }
  });

  // Settings
  app.get("/api/settings", (req, res) => {
    try {
      const settings = db.prepare("SELECT * FROM settings").all();
      const settingsObj = settings.reduce((acc: any, curr: any) => {
        acc[curr.key] = curr.value;
        return acc;
      }, {});
      res.json(settingsObj);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.post("/api/settings", (req, res) => {
    const { company_name, tax_rate, address, contact } = req.body;
    try {
      const update = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
      const updateSettings = db.transaction(() => {
        if (company_name !== undefined) update.run("company_name", company_name);
        if (tax_rate !== undefined) update.run("tax_rate", tax_rate.toString());
        if (address !== undefined) update.run("address", address);
        if (contact !== undefined) update.run("contact", contact);
      });
      updateSettings();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
