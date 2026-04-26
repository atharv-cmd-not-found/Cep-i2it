const mysql = require('mysql2/promise');
require('dotenv').config({ path: './.env.local' });

async function runVerification() {
    console.log("🚀 Starting DBMS CRUD Verification...");
    
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'cep_db'
    });

    try {
        // 1. CREATE (Insert)
        console.log("\n[CREATE] Adding sample user and item...");
        await connection.execute("INSERT IGNORE INTO users (user_id, username, display_name) VALUES (1, 'testuser', 'Test User')");
        await connection.execute("INSERT IGNORE INTO items (item_id, item_name, category) VALUES (1, 'Masala Dosa', 'Breakfast')");
        
        const [reviewResult] = await connection.execute(
            "INSERT INTO reviews (user_id, item_id, content, rating) VALUES (1, 1, 'Amazing taste!', 5)"
        );
        const reviewId = reviewResult.insertId;
        console.log(`✅ Review created with ID: ${reviewId}`);

        // 2. READ (Select)
        console.log("\n[READ] Fetching reviews with JOIN...");
        const [rows] = await connection.execute(`
            SELECT r.review_id, u.display_name, i.item_name, r.content, r.rating 
            FROM reviews r
            JOIN users u ON r.user_id = u.user_id
            JOIN items i ON r.item_id = i.item_id
            WHERE r.review_id = ?
        `, [reviewId]);
        console.table(rows);

        // 3. UPDATE
        console.log("\n[UPDATE] Modifying review content...");
        await connection.execute(
            "UPDATE reviews SET content = 'Even better the second time!', rating = 5 WHERE review_id = ?",
            [reviewId]
        );
        const [updatedRows] = await connection.execute("SELECT content, rating FROM reviews WHERE review_id = ?", [reviewId]);
        console.log("✅ Updated Data:", updatedRows[0]);

        // 4. DELETE
        console.log("\n[DELETE] Removing the review...");
        await connection.execute("DELETE FROM reviews WHERE review_id = ?", [reviewId]);
        const [afterDelete] = await connection.execute("SELECT COUNT(*) as count FROM reviews WHERE review_id = ?", [reviewId]);
        console.log(`✅ Remaining reviews with this ID: ${afterDelete[0].count}`);

        console.log("\n✨ CRUD Verification Completed Successfully!");

    } catch (err) {
        console.error("\n❌ Error during verification:", err.message);
        console.log("Note: Ensure your database is running and .env.local is configured.");
    } finally {
        await connection.end();
    }
}

runVerification();
