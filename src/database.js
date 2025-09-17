const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Función para migrar la base de datos existente
const migrateDatabase = async () => {
    try {
        console.log('🔄 Iniciando migración de base de datos...');
        
        // Verificar si la columna card_id ya existe
        const checkCardIdColumn = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'user_cards' 
            AND column_name = 'card_id'
        `);
        
        if (checkCardIdColumn.rows.length === 0) {
            console.log('➕ Agregando columna card_id...');
            
            // Agregar la nueva columna
            await pool.query('ALTER TABLE user_cards ADD COLUMN card_id VARCHAR(12)');
            
            // Generar IDs únicos para cartas existentes
            const existingCards = await pool.query('SELECT id FROM user_cards ORDER BY id');
            
            console.log(`🆔 Generando IDs para ${existingCards.rows.length} cartas existentes...`);
            
            for (let i = 0; i < existingCards.rows.length; i++) {
                const cardId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
                const uniqueId = cardId.toUpperCase().substring(0, 12);
                
                await pool.query(
                    'UPDATE user_cards SET card_id = $1 WHERE id = $2',
                    [uniqueId, existingCards.rows[i].id]
                );
            }
            
            // Hacer la columna NOT NULL y UNIQUE después de llenarla
            await pool.query('ALTER TABLE user_cards ALTER COLUMN card_id SET NOT NULL');
            await pool.query('ALTER TABLE user_cards ADD CONSTRAINT unique_card_id UNIQUE (card_id)');
            
            console.log('✅ Columna card_id agregada y poblada');
        } else {
            console.log('✅ Columna card_id ya existe');
        }
        
        // Verificar y agregar otras columnas nuevas
        const columnsToAdd = [
            { name: 'goals', type: 'INTEGER DEFAULT 0' },
            { name: 'assists', type: 'INTEGER DEFAULT 0' },
            { name: 'league', type: 'VARCHAR(100)' }
        ];
        
        for (const column of columnsToAdd) {
            const checkColumn = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'user_cards' 
                AND column_name = $1
            `, [column.name]);
            
            if (checkColumn.rows.length === 0) {
                console.log(`➕ Agregando columna ${column.name}...`);
                await pool.query(`ALTER TABLE user_cards ADD COLUMN ${column.name} ${column.type}`);
                console.log(`✅ Columna ${column.name} agregada`);
            } else {
                console.log(`✅ Columna ${column.name} ya existe`);
            }
        }
        
        // Crear índices si no existen
        const indicesToCreate = [
            { name: 'idx_user_cards_user_id', sql: 'CREATE INDEX IF NOT EXISTS idx_user_cards_user_id ON user_cards(user_id)' },
            { name: 'idx_user_cards_card_id', sql: 'CREATE INDEX IF NOT EXISTS idx_user_cards_card_id ON user_cards(card_id)' },
            { name: 'idx_user_cards_player_id', sql: 'CREATE INDEX IF NOT EXISTS idx_user_cards_player_id ON user_cards(player_id)' }
        ];
        
        for (const index of indicesToCreate) {
            try {
                await pool.query(index.sql);
                console.log(`✅ Índice ${index.name} creado/verificado`);
            } catch (error) {
                console.log(`ℹ️ Índice ${index.name}: ${error.message}`);
            }
        }
        
        console.log('🎉 Migración completada exitosamente');
        
    } catch (error) {
        console.error('❌ Error en migración:', error);
        throw error;
    }
};

// Crear tablas e inicializar la base de datos
const initDB = async () => {
    try {
        // Crear tabla de jugadores
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

        // Crear tabla de cartas de usuario (versión básica primero)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_cards (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255),
                player_id INTEGER REFERENCES players(id),
                collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('📊 Tablas básicas verificadas/creadas');
        
        // Ejecutar migración para agregar nuevas columnas
        await migrateDatabase();
        
        console.log('✅ Base de datos inicializada y migrada correctamente');
        
    } catch (err) {
        console.error('❌ Error inicializando base de datos:', err);
        throw err;
    }
};

initDB();

module.exports = pool;