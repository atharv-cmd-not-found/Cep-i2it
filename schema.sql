-- Canteen Evaluation Platform (DBMS Project) - Database Schema (3NF)
-- Optimized for MySQL

-- 1. Users Table
-- Stores authentication and profile information.
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100),
    google_id VARCHAR(255) UNIQUE, -- For Google OAuth integration
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Items Table
-- Stores the food/drink items available in the canteen.
-- Normalizing this avoids repeating item names in every review.
CREATE TABLE items (
    item_id INT AUTO_INCREMENT PRIMARY KEY,
    item_name VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(50) DEFAULT 'General', -- e.g., 'Breakfast', 'Lunch', 'Beverages'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Reviews (Posts) Table
-- Stores the actual reviews linking users to items.
-- This table is in 3NF as it contains only foreign keys and data specific to the review.
CREATE TABLE reviews (
    review_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    item_id INT NOT NULL,
    content TEXT NOT NULL,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    image_url VARCHAR(255), -- URL from Vercel Blob or other storage
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Foreign Key Constraints
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_item FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE
);

-- Indexing for performance
CREATE INDEX idx_reviews_rating ON reviews(rating);

-- Sample Data for Verification
-- INSERT INTO items (item_name, category) VALUES ('Coffee', 'Beverage'), ('Poha', 'Breakfast'), ('Upma', 'Breakfast');
