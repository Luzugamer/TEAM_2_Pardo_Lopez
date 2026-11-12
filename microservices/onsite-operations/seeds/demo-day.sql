INSERT INTO onsite.events(id,tenant_id,source_event_id,name,status,starts_at,ends_at) VALUES
('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000001','event-demo','Demo Day IncubaUNAS','active',now()-interval '1 hour',now()+interval '8 hours'),
('00000000-0000-0000-0000-000000000105','00000000-0000-0000-0000-000000000001','event-fiis','FIIS','active',now()-interval '1 hour',now()+interval '8 hours') ON CONFLICT DO NOTHING;
INSERT INTO onsite.scopes(id,event_id,code,name,kind) VALUES
('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000101','main','Auditorio UNAS','venue'),
('00000000-0000-0000-0000-000000000106','00000000-0000-0000-0000-000000000105','main','FIIS','venue'),
('00000000-0000-0000-0000-000000000107','00000000-0000-0000-0000-000000000101','cyber','Sala Cyber','gate') ON CONFLICT DO NOTHING;
INSERT INTO onsite.devices(id,tenant_id,label,status) VALUES('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000001','Demo Day Gate','active') ON CONFLICT DO NOTHING;
INSERT INTO onsite.operator_assignments(id,user_id,event_id,scope_id,device_id,role,valid_from,valid_until) VALUES('00000000-0000-0000-0000-000000000104','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000103','staff',now()-interval '1 day',now()+interval '1 day') ON CONFLICT DO NOTHING;
INSERT INTO onsite.ticket_projections(ticket_id,event_id,scope_id,status,expires_at,masked_holder,search_code,confirmed_at) VALUES
('DEMO-2026-001','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000102','active',now()+interval '1 day','A*** Demo','DEMO-2026-001',now()),
('DEMO-2026-002','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000102','active',now()+interval '1 day','B*** Demo','DEMO-2026-002',now()),
('DEMO-2026-003','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000102','active',now()+interval '1 day','C*** Demo','DEMO-2026-003',now()),
('DEMO-2026-004','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000102','revoked',now()+interval '1 day','D*** Demo','DEMO-2026-004',now()),
('DEMO-2026-005','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000102','expired',now()-interval '1 day','E*** Demo','DEMO-2026-005',now()),
('FIIS-2026-001','00000000-0000-0000-0000-000000000105','00000000-0000-0000-0000-000000000106','active',now()+interval '1 day','F*** Demo','FIIS-2026-001',now()),
('DEMO-CYBER-001','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000107','active',now()+interval '1 day','G*** Demo','DEMO-CYBER-001',now()) ON CONFLICT DO NOTHING;

DO $$
BEGIN
  FOR i IN 1..122 LOOP
    INSERT INTO onsite.ticket_projections(ticket_id,event_id,scope_id,status,expires_at,masked_holder,search_code,confirmed_at)
    VALUES('DEMO-SEED-' || lpad(i::text,3,'0'),'00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000102',CASE WHEN i <= 92 THEN 'active' ELSE 'revoked' END,now()+interval '1 day','Participante ' || lpad(i::text,3,'0'),'DEMO-SEED-' || lpad(i::text,3,'0'),CASE WHEN i <= 92 THEN now() ELSE NULL END)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
