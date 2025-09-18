const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});


const initDB = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS players (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255),
                team VARCHAR(255),
                position VARCHAR(100),
                nationality VARCHAR(100),
                image_url TEXT,
                rarity VARCHAR(50)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_cards (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255),
                player_id INTEGER REFERENCES players(id),
                collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('📊 Tablas básicas verificadas/creadas');
        
        await migrateDatabase();
        
        console.log('✅ Base de datos inicializada y migrada correctamente');
        
    } catch (err) {
        console.error('❌ Error inicializando base de datos:', err);
        throw err;
    }
};

initDB();

module.exports = pool;