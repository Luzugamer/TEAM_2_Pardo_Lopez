DO $$ BEGIN IF current_setting('app.environment',true) IN ('development','test') THEN NULL; END IF; END $$;
