ALTER TABLE admins ADD COLUMN role text NOT NULL DEFAULT 'admin';
ALTER TABLE admins ADD CONSTRAINT admins_role_check CHECK (role IN ('admin', 'operator'));
ALTER TABLE stores ADD COLUMN created_by_id uuid REFERENCES admins(id);
ALTER TABLE stores ADD COLUMN owner_id uuid REFERENCES admins(id);
CREATE INDEX stores_owner_id_idx ON stores(owner_id);
