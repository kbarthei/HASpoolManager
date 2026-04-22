#!/usr/bin/env node
/**
 * Auto-migration script for the SQLite database.
 * Runs on every addon start before Next.js boots.
 * Adds missing columns and indices — idempotent, safe to run repeatedly.
 *
 * Usage: node migrate-db.js
 * Reads SQLITE_PATH env var (default: ./data/haspoolmanager.db)
 */

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dbPath = process.env.SQLITE_PATH || path.join(__dirname, "../data/haspoolmanager.db");

console.log(`[migrate] Database: ${dbPath}`);

if (!fs.existsSync(dbPath)) {
  console.log("[migrate] Database file does not exist yet — skipping");
  process.exit(0);
}

let db;
try {
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
} catch (err) {
  console.error(`[migrate] Cannot open database: ${err.message}`);
  process.exit(0);
}

// ── Migration definitions ───────────────────────────────────────────────────
// Each migration checks if the change is needed before applying.

const migrations = [
  {
    name: "prints.spool_swaps column",
    check: () => {
      const cols = db.pragma("table_info(prints)");
      return cols.some((c) => c.name === "spool_swaps");
    },
    apply: () => {
      db.exec("ALTER TABLE prints ADD COLUMN spool_swaps TEXT");
    },
  },
  {
    name: "prints.cover_image_path column",
    check: () => {
      const cols = db.pragma("table_info(prints)");
      return cols.some((c) => c.name === "cover_image_path");
    },
    apply: () => {
      db.exec("ALTER TABLE prints ADD COLUMN cover_image_path TEXT");
    },
  },
  {
    name: "prints.snapshot_path column",
    check: () => {
      const cols = db.pragma("table_info(prints)");
      return cols.some((c) => c.name === "snapshot_path");
    },
    apply: () => {
      db.exec("ALTER TABLE prints ADD COLUMN snapshot_path TEXT");
    },
  },
  {
    name: "prints: rename total_cost to filament_cost",
    check: () => {
      const cols = db.pragma("table_info(prints)");
      return cols.some((c) => c.name === "filament_cost");
    },
    apply: () => {
      db.exec("ALTER TABLE prints RENAME COLUMN total_cost TO filament_cost");
    },
  },
  {
    name: "prints.energy_cost column",
    check: () => {
      const cols = db.pragma("table_info(prints)");
      return cols.some((c) => c.name === "energy_cost");
    },
    apply: () => {
      db.exec("ALTER TABLE prints ADD COLUMN energy_cost REAL");
    },
  },
  {
    name: "prints.energy_kwh column",
    check: () => {
      const cols = db.pragma("table_info(prints)");
      return cols.some((c) => c.name === "energy_kwh");
    },
    apply: () => {
      db.exec("ALTER TABLE prints ADD COLUMN energy_kwh REAL");
    },
  },
  {
    name: "prints.energy_start_kwh column",
    check: () => {
      const cols = db.pragma("table_info(prints)");
      return cols.some((c) => c.name === "energy_start_kwh");
    },
    apply: () => {
      db.exec("ALTER TABLE prints ADD COLUMN energy_start_kwh REAL");
    },
  },
  {
    name: "prints.energy_end_kwh column",
    check: () => {
      const cols = db.pragma("table_info(prints)");
      return cols.some((c) => c.name === "energy_end_kwh");
    },
    apply: () => {
      db.exec("ALTER TABLE prints ADD COLUMN energy_end_kwh REAL");
    },
  },
  {
    name: "prints.total_cost column (filament + energy)",
    check: () => {
      const cols = db.pragma("table_info(prints)");
      // total_cost column must exist AND filament_cost must also exist
      // (if filament_cost doesn't exist, total_cost is the old un-renamed column)
      return cols.some((c) => c.name === "total_cost") && cols.some((c) => c.name === "filament_cost");
    },
    apply: () => {
      db.exec("ALTER TABLE prints ADD COLUMN total_cost REAL");
      db.exec("UPDATE prints SET total_cost = filament_cost WHERE filament_cost IS NOT NULL");
    },
  },
  {
    name: "hms_events table",
    check: () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='hms_events'").all();
      return tables.length > 0;
    },
    apply: () => {
      db.exec(`
        CREATE TABLE hms_events (
          id TEXT PRIMARY KEY,
          printer_id TEXT NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
          print_id TEXT REFERENCES prints(id) ON DELETE SET NULL,
          spool_id TEXT REFERENCES spools(id) ON DELETE SET NULL,
          filament_id TEXT REFERENCES filaments(id) ON DELETE SET NULL,
          hms_code TEXT NOT NULL,
          module TEXT,
          severity TEXT,
          message TEXT,
          wiki_url TEXT,
          slot_key TEXT,
          raw_attr INTEGER,
          raw_code INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      db.exec("CREATE INDEX idx_hms_printer ON hms_events(printer_id)");
      db.exec("CREATE INDEX idx_hms_filament ON hms_events(filament_id)");
      db.exec("CREATE INDEX idx_hms_created ON hms_events(created_at)");
    },
  },
  {
    name: "vendors.default_spool_weight column",
    check: () => {
      const cols = db.pragma("table_info(vendors)");
      return cols.some((c) => c.name === "default_spool_weight");
    },
    apply: () => {
      db.exec("ALTER TABLE vendors ADD COLUMN default_spool_weight INTEGER");
      // Seed known spool weights (empty spool, grams)
      db.exec("UPDATE vendors SET default_spool_weight = 250 WHERE LOWER(name) = 'bambu lab'");
      db.exec("UPDATE vendors SET default_spool_weight = 140 WHERE LOWER(name) = 'polymaker'");
      db.exec("UPDATE vendors SET default_spool_weight = 170 WHERE LOWER(name) = 'esun'");
    },
  },
  {
    name: "drop unused reorder/auto-supply tables",
    check: () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reorder_rules'").all();
      return tables.length === 0;
    },
    apply: () => {
      // Remove FK from orders first
      // SQLite doesn't support DROP COLUMN easily, so we just leave auto_supply_log_id orphaned
      db.exec("DROP TABLE IF EXISTS auto_supply_log");
      db.exec("DROP TABLE IF EXISTS auto_supply_rules");
      db.exec("DROP TABLE IF EXISTS reorder_rules");
    },
  },
  {
    name: "consumption_stats table",
    check: () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='consumption_stats'").all();
      return tables.length > 0;
    },
    apply: () => {
      db.exec(`
        CREATE TABLE consumption_stats (
          id TEXT PRIMARY KEY,
          filament_id TEXT NOT NULL REFERENCES filaments(id) ON DELETE CASCADE,
          date TEXT NOT NULL,
          weight_grams REAL NOT NULL DEFAULT 0,
          print_count INTEGER NOT NULL DEFAULT 0,
          UNIQUE(filament_id, date)
        )
      `);
      db.exec("CREATE INDEX idx_consumption_filament ON consumption_stats(filament_id)");
      db.exec("CREATE INDEX idx_consumption_date ON consumption_stats(date)");
    },
  },
  {
    name: "supply_rules table",
    check: () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='supply_rules'").all();
      return tables.length > 0;
    },
    apply: () => {
      db.exec(`
        CREATE TABLE supply_rules (
          id TEXT PRIMARY KEY,
          filament_id TEXT REFERENCES filaments(id) ON DELETE CASCADE,
          material TEXT,
          vendor_id TEXT REFERENCES vendors(id) ON DELETE CASCADE,
          source TEXT NOT NULL DEFAULT 'manual',
          is_confirmed INTEGER NOT NULL DEFAULT 0,
          min_spools INTEGER NOT NULL DEFAULT 1,
          max_stock_spools INTEGER NOT NULL DEFAULT 5,
          preferred_shop_id TEXT REFERENCES shops(id) ON DELETE SET NULL,
          max_price_per_spool REAL,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      db.exec("CREATE INDEX idx_supply_rules_filament ON supply_rules(filament_id)");
    },
  },
  {
    name: "supply_alerts table",
    check: () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='supply_alerts'").all();
      return tables.length > 0;
    },
    apply: () => {
      db.exec(`
        CREATE TABLE supply_alerts (
          id TEXT PRIMARY KEY,
          filament_id TEXT NOT NULL REFERENCES filaments(id) ON DELETE CASCADE,
          alert_type TEXT NOT NULL,
          severity TEXT NOT NULL,
          title TEXT NOT NULL,
          message TEXT,
          data TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          auto_added_to_list INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          resolved_at TEXT
        )
      `);
      db.exec("CREATE INDEX idx_supply_alerts_status ON supply_alerts(status)");
      db.exec("CREATE INDEX idx_supply_alerts_filament ON supply_alerts(filament_id)");
    },
  },
  {
    name: "material_profiles table",
    check: () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='material_profiles'").all();
      return tables.length > 0;
    },
    apply: () => {
      db.exec(`
        CREATE TABLE material_profiles (
          material TEXT PRIMARY KEY,
          strength INTEGER,
          flexibility INTEGER,
          heat_resistance INTEGER,
          uv_resistance INTEGER,
          print_ease INTEGER,
          humidity_sensitivity INTEGER,
          needs_enclosure INTEGER NOT NULL DEFAULT 0,
          needs_hardened_nozzle INTEGER NOT NULL DEFAULT 0,
          is_abrasive INTEGER NOT NULL DEFAULT 0,
          glass_transition_c INTEGER,
          density REAL,
          best_for TEXT,
          not_for TEXT,
          substitutes TEXT,
          drying_temp_c INTEGER,
          drying_hours INTEGER,
          description TEXT,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
    },
  },
  {
    name: "seed material_profiles with 18 materials",
    check: () => {
      try {
        const row = db.prepare("SELECT COUNT(*) as cnt FROM material_profiles").get();
        return row.cnt > 0;
      } catch {
        return true; // table doesn't exist yet, skip
      }
    },
    apply: () => {
      const now = new Date().toISOString().replace("T", " ").slice(0, 19);
      const insert = db.prepare(`
        INSERT INTO material_profiles (
          material, strength, flexibility, heat_resistance, uv_resistance, print_ease,
          humidity_sensitivity, needs_enclosure, needs_hardened_nozzle, is_abrasive,
          glass_transition_c, density, best_for, not_for, substitutes,
          drying_temp_c, drying_hours, description, updated_at
        ) VALUES (
          @material, @strength, @flexibility, @heat_resistance, @uv_resistance, @print_ease,
          @humidity_sensitivity, @needs_enclosure, @needs_hardened_nozzle, @is_abrasive,
          @glass_transition_c, @density, @best_for, @not_for, @substitutes,
          @drying_temp_c, @drying_hours, @description, @updated_at
        )
      `);

      const materials = [
        {
          material: "PLA", strength: 3, flexibility: 1, heat_resistance: 1, uv_resistance: 1,
          print_ease: 5, humidity_sensitivity: 2, needs_enclosure: 0, needs_hardened_nozzle: 0,
          is_abrasive: 0, glass_transition_c: 60, density: 1.24,
          best_for: JSON.stringify(["Prototypen", "Deko", "Cosplay", "Haushalt"]),
          not_for: JSON.stringify(["Outdoor", "Hitze über 60°C", "Mechanische Belastung"]),
          substitutes: JSON.stringify(["PLA+", "PLA Matte"]),
          drying_temp_c: 50, drying_hours: 4,
          description: "Das vielseitigste Einsteiger-Filament. Einfach zu drucken, kaum Warping, geruchsarm. Ideal für Prototypen, Deko-Objekte und Haushaltshelfer. Nicht geeignet für Hitze über 60°C (verformt sich z.B. im Auto) oder mechanisch stark beanspruchte Teile. Am H2S mit offenem Deckel drucken um Hitzestau zu vermeiden.",
          updated_at: now,
        },
        {
          material: "PLA+", strength: 3, flexibility: 2, heat_resistance: 2, uv_resistance: 1,
          print_ease: 5, humidity_sensitivity: 2, needs_enclosure: 0, needs_hardened_nozzle: 0,
          is_abrasive: 0, glass_transition_c: 62, density: 1.24,
          best_for: JSON.stringify(["Funktionsteile", "Prototypen", "Spielzeug", "Haushalt"]),
          not_for: JSON.stringify(["Outdoor langfristig", "Hitze über 65°C", "Federnde Teile"]),
          substitutes: JSON.stringify(["PLA", "PETG"]),
          drying_temp_c: 50, drying_hours: 4,
          description: "Verbesserte PLA-Variante mit höherer Zähigkeit und leicht besserer Temperaturbeständigkeit. Druckt genauso einfach wie Standard-PLA, bricht aber weniger spröde. Gut für funktionale Prototypen und Teile mit moderater Belastung. Am H2S mit Standard-PLA-Profil drucken, Deckel offen lassen.",
          updated_at: now,
        },
        {
          material: "PETG", strength: 3, flexibility: 2, heat_resistance: 3, uv_resistance: 3,
          print_ease: 4, humidity_sensitivity: 2, needs_enclosure: 0, needs_hardened_nozzle: 0,
          is_abrasive: 0, glass_transition_c: 80, density: 1.27,
          best_for: JSON.stringify(["Outdoor-Teile", "Behälter", "Mechanische Teile", "Lebensmittelkontakt"]),
          not_for: JSON.stringify(["Präzise Oberflächen", "Schnappverbindungen", "Überhänge ohne Support"]),
          substitutes: JSON.stringify(["PLA+", "ABS"]),
          drying_temp_c: 65, drying_hours: 8,
          description: "Der beste Kompromiss aus Druckbarkeit und Belastbarkeit. Gute chemische und UV-Beständigkeit, lebensmittelecht möglich. Neigt zu Stringing, daher Retraction-Settings optimieren. Am H2S ohne Enclosure druckbar, Bett auf 70-80°C für gute Haftung.",
          updated_at: now,
        },
        {
          material: "ABS", strength: 4, flexibility: 2, heat_resistance: 4, uv_resistance: 2,
          print_ease: 2, humidity_sensitivity: 1, needs_enclosure: 1, needs_hardened_nozzle: 0,
          is_abrasive: 0, glass_transition_c: 105, density: 1.04,
          best_for: JSON.stringify(["Gehäuse", "Automotive", "Hitzebeständige Teile", "Nachbearbeitung mit Aceton"]),
          not_for: JSON.stringify(["Große flache Teile ohne Enclosure", "Outdoor UV-Exposition", "Geruchsempfindliche Umgebungen"]),
          substitutes: JSON.stringify(["ASA", "ABS-GF"]),
          drying_temp_c: 80, drying_hours: 6,
          description: "Klassisches Industrie-Filament mit hoher Hitzebeständigkeit und guter Schlagfestigkeit. Warping ist das Hauptproblem — Enclosure zwingend nötig. Kann mit Aceton geglättet werden für perfekte Oberflächen. Am H2S unbedingt Deckel geschlossen halten und gut belüften, ABS-Dämpfe sind gesundheitsschädlich.",
          updated_at: now,
        },
        {
          material: "ASA", strength: 4, flexibility: 2, heat_resistance: 4, uv_resistance: 5,
          print_ease: 3, humidity_sensitivity: 1, needs_enclosure: 1, needs_hardened_nozzle: 0,
          is_abrasive: 0, glass_transition_c: 100, density: 1.07,
          best_for: JSON.stringify(["Outdoor-Gehäuse", "Automotive", "Gartengeräte", "UV-exponierte Teile"]),
          not_for: JSON.stringify(["Geschlossene Räume ohne Abzug", "Große filigrane Teile", "Anfänger"]),
          substitutes: JSON.stringify(["ABS", "PETG"]),
          drying_temp_c: 80, drying_hours: 6,
          description: "Die UV-beständige Alternative zu ABS — perfekt für alles was draußen steht. Vergilbt nicht und bleibt formstabil in der Sonne. Druckt etwas einfacher als ABS, braucht aber trotzdem Enclosure. Am H2S mit geschlossenem Deckel und ABS-Profil drucken, Belüftung sicherstellen.",
          updated_at: now,
        },
        {
          material: "TPU 95A", strength: 2, flexibility: 5, heat_resistance: 3, uv_resistance: 3,
          print_ease: 2, humidity_sensitivity: 3, needs_enclosure: 0, needs_hardened_nozzle: 0,
          is_abrasive: 0, glass_transition_c: -40, density: 1.21,
          best_for: JSON.stringify(["Handyhüllen", "Stoßdämpfer", "Dichtungen", "Flexible Verbinder"]),
          not_for: JSON.stringify(["Präzisionsteile", "Starre Konstruktionen", "Schneller Druck"]),
          substitutes: JSON.stringify([]),
          drying_temp_c: 50, drying_hours: 6,
          description: "Flexibles, gummiartiges Filament für elastische Teile. Sehr gute Schlagdämpfung und chemische Beständigkeit. Druckgeschwindigkeit muss deutlich reduziert werden (20-30 mm/s), Direct Drive bevorzugt. Am H2S langsam drucken und Retraction minimieren, der Direct Extruder kommt gut mit TPU zurecht.",
          updated_at: now,
        },
        {
          material: "PA", strength: 5, flexibility: 3, heat_resistance: 4, uv_resistance: 2,
          print_ease: 2, humidity_sensitivity: 5, needs_enclosure: 1, needs_hardened_nozzle: 0,
          is_abrasive: 0, glass_transition_c: 70, density: 1.14,
          best_for: JSON.stringify(["Zahnräder", "Scharniere", "Lager", "Hochbelastete Funktionsteile"]),
          not_for: JSON.stringify(["Feuchte Umgebungen ohne Beschichtung", "Maßhaltige Teile ohne Trocknung", "Anfänger"]),
          substitutes: JSON.stringify(["PA-CF", "PA6-GF"]),
          drying_temp_c: 80, drying_hours: 12,
          description: "Nylon ist extrem zäh und abriebfest — das Material für mechanisch hochbelastete Teile. Saugt aber Feuchtigkeit wie ein Schwamm, was zu Blasenbildung und schlechter Druckqualität führt. Unbedingt trocken lagern und vor dem Druck trocknen. Am H2S mit Enclosure drucken, idealerweise direkt aus dem Trockner zuführen.",
          updated_at: now,
        },
        {
          material: "PA-CF", strength: 5, flexibility: 1, heat_resistance: 5, uv_resistance: 3,
          print_ease: 2, humidity_sensitivity: 5, needs_enclosure: 1, needs_hardened_nozzle: 1,
          is_abrasive: 1, glass_transition_c: 75, density: 1.18,
          best_for: JSON.stringify(["Drohnenteile", "Werkzeuge", "Strukturteile", "Leichtbau"]),
          not_for: JSON.stringify(["Standarddüsen (verstopfen)", "Feuchte Lagerung", "Flexible Teile"]),
          substitutes: JSON.stringify(["PA6-GF", "PETG-CF"]),
          drying_temp_c: 80, drying_hours: 12,
          description: "Carbonfaser-verstärktes Nylon — extrem steif und leicht bei herausragender Hitzebeständigkeit. Ersetzt Aluminium in vielen Anwendungen. Zerstört normale Messingdüsen in wenigen Stunden, gehärtete Stahldüse ist Pflicht. Am H2S mit Hardened-Steel-Nozzle und geschlossenem Deckel drucken, vorher 12h trocknen.",
          updated_at: now,
        },
        {
          material: "PC", strength: 5, flexibility: 2, heat_resistance: 5, uv_resistance: 3,
          print_ease: 1, humidity_sensitivity: 4, needs_enclosure: 1, needs_hardened_nozzle: 0,
          is_abrasive: 0, glass_transition_c: 147, density: 1.20,
          best_for: JSON.stringify(["Transparente Teile", "Schutzabdeckungen", "Hochtemperatur-Anwendungen", "Optische Teile"]),
          not_for: JSON.stringify(["Anfänger", "Drucker ohne Enclosure", "Schnelle Prototypen"]),
          substitutes: JSON.stringify(["PETG", "ABS"]),
          drying_temp_c: 80, drying_hours: 12,
          description: "Polycarbonat ist eines der stärksten druckbaren Materialien mit der höchsten Glasübergangstemperatur. Nahezu unzerbrechlich und optional transparent. Braucht sehr hohe Drucktemperaturen (270-310°C) und striktes Enclosure. Am H2S an der Grenze des Machbaren — nur mit geschlossenem Deckel und perfekt getrockneten Filament versuchen.",
          updated_at: now,
        },
        {
          material: "PVA", strength: 1, flexibility: 1, heat_resistance: 1, uv_resistance: 1,
          print_ease: 3, humidity_sensitivity: 5, needs_enclosure: 0, needs_hardened_nozzle: 0,
          is_abrasive: 0, glass_transition_c: 85, density: 1.23,
          best_for: JSON.stringify(["Wasserlöslicher Support", "Komplexe Überhänge", "Dual-Extrusion Support"]),
          not_for: JSON.stringify(["Eigenständige Teile", "Feuchte Umgebungen", "Langzeitlagerung"]),
          substitutes: JSON.stringify([]),
          drying_temp_c: 45, drying_hours: 6,
          description: "Wasserlösliches Stützmaterial für perfekte Überhänge bei Dual-Extrusion. Löst sich in warmem Wasser vollständig auf und hinterlässt saubere Oberflächen. Extrem hygroskopisch — wird bei Luftfeuchtigkeit schnell unbrauchbar. Am H2S als Support-Material im AMS lagern und nur bei Bedarf laden, Restmenge vakuumverpackt aufbewahren.",
          updated_at: now,
        },
        {
          material: "HIPS", strength: 2, flexibility: 2, heat_resistance: 3, uv_resistance: 2,
          print_ease: 3, humidity_sensitivity: 1, needs_enclosure: 1, needs_hardened_nozzle: 0,
          is_abrasive: 0, glass_transition_c: 100, density: 1.05,
          best_for: JSON.stringify(["Support für ABS", "Leichtbau-Prototypen", "Verpackungen", "Modellbau"]),
          not_for: JSON.stringify(["Mechanisch belastete Teile", "Outdoor ohne Beschichtung", "Präzisionsteile"]),
          substitutes: JSON.stringify(["ABS", "PVA"]),
          drying_temp_c: 80, drying_hours: 6,
          description: "High Impact Polystyrol — leicht, günstig und in Limonene löslich. Hauptsächlich als Support-Material für ABS im Dual-Extrusion-Druck verwendet. Als eigenständiges Material leicht und einfach zu bearbeiten. Am H2S mit ABS-Einstellungen und Enclosure drucken, gut als Support-Kombination mit ABS geeignet.",
          updated_at: now,
        },
        {
          material: "PLA-CF", strength: 4, flexibility: 1, heat_resistance: 2, uv_resistance: 2,
          print_ease: 4, humidity_sensitivity: 2, needs_enclosure: 0, needs_hardened_nozzle: 1,
          is_abrasive: 1, glass_transition_c: 60, density: 1.29,
          best_for: JSON.stringify(["Steife Leichtbauteile", "Drohnenrahmen", "Kamera-Halterungen", "Dekorative Strukturteile"]),
          not_for: JSON.stringify(["Standarddüsen", "Flexible Teile", "Hitze über 60°C"]),
          substitutes: JSON.stringify(["PETG-CF", "PA-CF"]),
          drying_temp_c: 50, drying_hours: 6,
          description: "Carbonfaser-verstärktes PLA — deutlich steifer als normales PLA bei ähnlich einfacher Druckbarkeit. Matte, professionelle Oberfläche. Gehärtete Düse nötig, da die Fasern Messing schnell abnutzen. Am H2S mit Hardened-Steel-Nozzle drucken, ansonsten PLA-Profil verwenden, Deckel offen.",
          updated_at: now,
        },
        {
          material: "PETG-CF", strength: 4, flexibility: 1, heat_resistance: 3, uv_resistance: 3,
          print_ease: 3, humidity_sensitivity: 2, needs_enclosure: 0, needs_hardened_nozzle: 1,
          is_abrasive: 1, glass_transition_c: 82, density: 1.33,
          best_for: JSON.stringify(["Funktionale Leichtbauteile", "Outdoor-Strukturteile", "Werkzeughalter", "Belastbare Gehäuse"]),
          not_for: JSON.stringify(["Standarddüsen", "Flexible Verbindungen", "Transparente Teile"]),
          substitutes: JSON.stringify(["PLA-CF", "PA-CF"]),
          drying_temp_c: 65, drying_hours: 8,
          description: "Carbonfaser-verstärktes PETG kombiniert die Chemikalienbeständigkeit von PETG mit der Steifigkeit von Carbonfasern. Gute Alternative zu PA-CF wenn Feuchtigkeitsempfindlichkeit ein Problem ist. Gehärtete Düse ist Pflicht. Am H2S mit PETG-Profil und Hardened-Steel-Nozzle drucken, Retraction-Settings anpassen.",
          updated_at: now,
        },
        {
          material: "PLA Silk", strength: 2, flexibility: 1, heat_resistance: 1, uv_resistance: 1,
          print_ease: 4, humidity_sensitivity: 2, needs_enclosure: 0, needs_hardened_nozzle: 0,
          is_abrasive: 0, glass_transition_c: 58, density: 1.24,
          best_for: JSON.stringify(["Vasen", "Deko-Objekte", "Geschenke", "Cosplay-Accessoires"]),
          not_for: JSON.stringify(["Funktionsteile", "Mechanische Belastung", "Outdoor"]),
          substitutes: JSON.stringify(["PLA", "PLA Matte"]),
          drying_temp_c: 50, drying_hours: 4,
          description: "PLA mit seidigem Glanz und metallisch schimmernder Oberfläche. Rein dekoratives Filament mit beeindruckendem Look aber reduzierter Festigkeit. Layer-Lines werden durch den Glanzeffekt kaschiert. Am H2S mit PLA-Profil drucken, etwas höhere Temperatur (215-225°C) für besten Glanzeffekt.",
          updated_at: now,
        },
        {
          material: "PLA Matte", strength: 3, flexibility: 1, heat_resistance: 1, uv_resistance: 1,
          print_ease: 5, humidity_sensitivity: 2, needs_enclosure: 0, needs_hardened_nozzle: 0,
          is_abrasive: 0, glass_transition_c: 60, density: 1.24,
          best_for: JSON.stringify(["Prototypen", "Gehäuse", "Modelle", "Figuren"]),
          not_for: JSON.stringify(["Outdoor", "Hitze über 60°C", "Mechanische Belastung"]),
          substitutes: JSON.stringify(["PLA", "PLA+"]),
          drying_temp_c: 50, drying_hours: 4,
          description: "PLA mit matter Oberfläche die Layer-Lines nahezu unsichtbar macht. Perfekt für Teile die ohne Nachbearbeitung professionell aussehen sollen. Gleiche Druckbarkeit wie Standard-PLA. Am H2S mit Standard-PLA-Profil drucken, besonders gut für Bambu Lab Matte PLA mit RFID-Erkennung.",
          updated_at: now,
        },
        {
          material: "ABS-GF", strength: 4, flexibility: 1, heat_resistance: 4, uv_resistance: 3,
          print_ease: 2, humidity_sensitivity: 1, needs_enclosure: 1, needs_hardened_nozzle: 1,
          is_abrasive: 1, glass_transition_c: 108, density: 1.20,
          best_for: JSON.stringify(["Automotive-Teile", "Hitzebeständige Gehäuse", "Industrieteile", "Strukturkomponenten"]),
          not_for: JSON.stringify(["Standarddüsen", "Flexible Teile", "Anfänger"]),
          substitutes: JSON.stringify(["ABS", "PA6-GF"]),
          drying_temp_c: 80, drying_hours: 6,
          description: "Glasfaser-verstärktes ABS für maximale Steifigkeit und Hitzebeständigkeit im ABS-Bereich. Reduziert Warping gegenüber reinem ABS durch die Faserverstärkung. Gehärtete Düse und Enclosure sind Pflicht. Am H2S mit geschlossenem Deckel und ABS-Profil drucken, Hardened-Steel-Nozzle verwenden.",
          updated_at: now,
        },
        {
          material: "PA6-GF", strength: 5, flexibility: 2, heat_resistance: 5, uv_resistance: 3,
          print_ease: 1, humidity_sensitivity: 5, needs_enclosure: 1, needs_hardened_nozzle: 1,
          is_abrasive: 1, glass_transition_c: 75, density: 1.30,
          best_for: JSON.stringify(["Strukturteile", "Ersatzteile Industrie", "Hochlast-Zahnräder", "Maschinenbauteile"]),
          not_for: JSON.stringify(["Anfänger", "Standarddüsen", "Feuchte Lagerung", "Schnelle Prototypen"]),
          substitutes: JSON.stringify(["PA-CF", "ABS-GF"]),
          drying_temp_c: 80, drying_hours: 12,
          description: "Glasfaser-verstärktes Nylon 6 — das stärkste gängige FDM-Material. Extreme Zähigkeit und Hitzebeständigkeit für industrielle Anwendungen. Saugt Feuchtigkeit extrem schnell, muss vakuumverpackt gelagert und direkt vor dem Druck getrocknet werden. Am H2S nur mit Hardened-Steel-Nozzle, Enclosure und perfekt getrocknetem Filament druckbar.",
          updated_at: now,
        },
        {
          material: "PET-CF", strength: 4, flexibility: 1, heat_resistance: 4, uv_resistance: 4,
          print_ease: 3, humidity_sensitivity: 2, needs_enclosure: 0, needs_hardened_nozzle: 1,
          is_abrasive: 1, glass_transition_c: 85, density: 1.35,
          best_for: JSON.stringify(["Outdoor-Strukturteile", "UV-beständige Funktionsteile", "Leichtbau-Gehäuse", "Automotive"]),
          not_for: JSON.stringify(["Standarddüsen", "Flexible Teile", "Transparente Anwendungen"]),
          substitutes: JSON.stringify(["PETG-CF", "PA-CF"]),
          drying_temp_c: 65, drying_hours: 8,
          description: "Carbonfaser-verstärktes PET bietet exzellente UV- und Hitzebeständigkeit kombiniert mit hoher Steifigkeit. Weniger feuchtigkeitsempfindlich als PA-CF bei ähnlicher Festigkeit. Gute Wahl für Outdoor-Anwendungen die Steifigkeit erfordern. Am H2S mit PETG-Profil und Hardened-Steel-Nozzle drucken, kein Enclosure nötig.",
          updated_at: now,
        },
      ];

      const insertAll = db.transaction((items) => {
        for (const item of items) {
          insert.run(item);
        }
      });
      insertAll(materials);
    },
  },
  {
    name: "shops: shipping and discount columns",
    check: () => {
      const cols = db.pragma("table_info(shops)");
      return cols.some((c) => c.name === "free_shipping_threshold");
    },
    apply: () => {
      db.exec("ALTER TABLE shops ADD COLUMN free_shipping_threshold REAL");
      db.exec("ALTER TABLE shops ADD COLUMN shipping_cost REAL");
      db.exec("ALTER TABLE shops ADD COLUMN bulk_discount_rules TEXT");
      db.exec("ALTER TABLE shops ADD COLUMN avg_delivery_days REAL");
    },
  },
  {
    name: "data_quality_log table",
    check: () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='data_quality_log'").all();
      return tables.length > 0;
    },
    apply: () => {
      db.exec(`
        CREATE TABLE data_quality_log (
          id TEXT PRIMARY KEY,
          run_at TEXT NOT NULL,
          rule_id TEXT NOT NULL,
          severity TEXT NOT NULL,
          entity_type TEXT,
          entity_id TEXT,
          action TEXT NOT NULL,
          details TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      db.exec("CREATE INDEX idx_quality_log_run_at ON data_quality_log(run_at)");
      db.exec("CREATE INDEX idx_quality_log_rule ON data_quality_log(rule_id)");
    },
  },
  {
    name: "spool weight clamp triggers",
    check: () => {
      const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='chk_spool_weight_negative'").all();
      return triggers.length > 0;
    },
    apply: () => {
      // AFTER UPDATE triggers that clamp weights back into valid range.
      // Relies on recursive_triggers=OFF (SQLite default) so the inner
      // UPDATE does not re-fire the trigger.
      db.exec(`
        CREATE TRIGGER chk_spool_weight_negative AFTER UPDATE OF remaining_weight ON spools
          WHEN NEW.remaining_weight < 0
          BEGIN
            UPDATE spools SET remaining_weight = 0 WHERE id = NEW.id;
          END;
      `);
      db.exec(`
        CREATE TRIGGER chk_spool_weight_max AFTER UPDATE OF remaining_weight ON spools
          WHEN NEW.remaining_weight > NEW.initial_weight AND NEW.initial_weight > 0
          BEGIN
            UPDATE spools SET remaining_weight = NEW.initial_weight WHERE id = NEW.id;
          END;
      `);
    },
  },
  {
    name: "racks table (multi-rack support)",
    check: () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='racks'").all();
      return tables.length > 0;
    },
    apply: () => {
      db.exec(`
        CREATE TABLE racks (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          rows INTEGER NOT NULL,
          cols INTEGER NOT NULL,
          sort_order INTEGER DEFAULT 0 NOT NULL,
          archived_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
    },
  },
  {
    name: "printer_ams_units table (multi-AMS topology)",
    check: () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='printer_ams_units'").all();
      return tables.length > 0;
    },
    apply: () => {
      db.exec(`
        CREATE TABLE printer_ams_units (
          id TEXT PRIMARY KEY NOT NULL,
          printer_id TEXT NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
          ams_index INTEGER NOT NULL,
          slot_type TEXT NOT NULL,
          ha_device_id TEXT DEFAULT '' NOT NULL,
          display_name TEXT NOT NULL,
          enabled INTEGER DEFAULT 1 NOT NULL,
          discovered_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      db.exec("CREATE UNIQUE INDEX uq_printer_ams_unit ON printer_ams_units (printer_id, ams_index, slot_type)");
    },
  },
  {
    name: "backfill default rack and rewrite spool locations",
    check: () => {
      try {
        return (db.prepare("SELECT COUNT(*) as c FROM racks").get().c) > 0;
      } catch {
        return false;
      }
    },
    apply: () => {
      // Pattern-consistent with other migrations: inline the backfill logic.
      // Tests cover the same logic via lib/migrate-data.ts (migrateRackData).
      const rowsSetting = db.prepare("SELECT value FROM settings WHERE key = ?").get("rack_rows");
      const colsSetting = db.prepare("SELECT value FROM settings WHERE key = ?").get("rack_columns");
      const rows = rowsSetting ? parseInt(rowsSetting.value, 10) : 3;
      const cols = colsSetting ? parseInt(colsSetting.value, 10) : 10;
      const defaultRackId = require("crypto").randomUUID();

      db.prepare(
        "INSERT INTO racks (id, name, rows, cols, sort_order) VALUES (?, ?, ?, ?, ?)"
      ).run(defaultRackId, "Main", rows, cols, 0);

      // Rewrite legacy rack locations: "rack:R-C" → "rack:<id>:R-C"
      const rewriteStmt = db.prepare("UPDATE spools SET location = ? WHERE id = ?");
      const allSpools = db.prepare("SELECT id, location FROM spools").all();
      let rewrote = 0;
      for (const s of allSpools) {
        if (!s.location || !s.location.startsWith("rack:")) continue;
        // Already migrated (two colons): skip
        if (s.location.match(/^rack:[^:]+:[^:]+$/)) continue;
        const match = s.location.match(/^rack:(\d+)-(\d+)$/);
        if (!match) continue;
        rewriteStmt.run(`rack:${defaultRackId}:${match[1]}-${match[2]}`, s.id);
        rewrote++;
      }

      db.prepare("DELETE FROM settings WHERE key IN (?, ?)").run("rack_rows", "rack_columns");

      console.log(`[migrate]   → Created rack '${defaultRackId}' (${rows}×${cols}), rewrote ${rewrote} spool location(s), dropped legacy settings`);
    },
  },
  {
    name: "backfill printer_ams_units from amsSlots",
    check: () => {
      try {
        return (db.prepare("SELECT COUNT(*) as c FROM printer_ams_units").get().c) > 0;
      } catch {
        return false;
      }
    },
    apply: () => {
      const printers = db.prepare("SELECT id FROM printers").all();
      const insertStmt = db.prepare(
        "INSERT INTO printer_ams_units (id, printer_id, ams_index, slot_type, ha_device_id, display_name, enabled) VALUES (?, ?, ?, ?, '', ?, 1)"
      );
      let created = 0;
      for (const p of printers) {
        const combos = db.prepare(
          "SELECT DISTINCT ams_index, slot_type FROM ams_slots WHERE printer_id = ? AND slot_type IN ('ams', 'ams_ht')"
        ).all(p.id);
        // Stable sort: ams before ams_ht, then amsIndex asc
        combos.sort((a, b) => {
          if (a.slot_type !== b.slot_type) return a.slot_type === "ams" ? -1 : 1;
          return a.ams_index - b.ams_index;
        });
        for (const c of combos) {
          const displayName = c.slot_type === "ams_ht" ? "AMS HT" : `AMS ${c.ams_index + 1}`;
          insertStmt.run(require("crypto").randomUUID(), p.id, c.ams_index, c.slot_type, displayName);
          created++;
        }
      }
      if (created > 0) {
        console.log(`[migrate]   → Created ${created} AMS unit(s) across ${printers.length} printer(s)`);
      }
    },
  },
  {
    name: "drop printers.ams_count column (replaced by printer_ams_units)",
    check: () => {
      const cols = db.pragma("table_info(printers)");
      return !cols.some((c) => c.name === "ams_count");
    },
    apply: () => {
      db.exec("ALTER TABLE printers DROP COLUMN ams_count");
    },
  },
];

// ── Run migrations ──────────────────────────────────────────────────────────

let applied = 0;
for (const m of migrations) {
  try {
    if (!m.check()) {
      console.log(`[migrate] Applying: ${m.name}`);
      m.apply();
      applied++;
    }
  } catch (err) {
    console.error(`[migrate] Error in "${m.name}": ${err.message}`);
  }
}

if (applied > 0) {
  console.log(`[migrate] Applied ${applied} migration(s)`);
} else {
  console.log(`[migrate] Schema up to date`);
}

db.close();
