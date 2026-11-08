-- =====================================================================================================
-- Projects from the project list sheet (62 projects). Run the blocks IN ORDER in the Supabase SQL editor.
-- Defaults used where the sheet is blank (change them afterwards in the portal or with UPDATE):
--   * location: the City column; Riyadh when it is empty      * main contractor: Riyadh Villas Contracting
--   * client: "Not specified" when the sheet has none          * status: active, progress 0 (sheet has no progress)
--   * category from the code: CD = Building Construction, MF = Metal Fabrication, MP = MEP Works
--   * no expected completion date / contract value (not in the sheet)
-- Safe to re-run: existing project codes are skipped.
-- =====================================================================================================

-- 1) category used by the MF projects
insert into "proj-dashboard-project-categories" (name, sort_order) values ('Metal Fabrication', 35) on conflict do nothing;

-- 2) the projects
insert into "proj-dashboard-projects" (code, name, client_name, main_contractor, location, category, status, progress, start_date) values
  ('101CD201', 'AL URUBA PARK - Kiosk Structural', 'Al Yamama', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2025-01-01'),
  ('101CD202', 'AL URUBA PARK - Plumbing and Drainage', 'Al Yamama', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2025-01-01'),
  ('101CD203', 'AL URUBA PARK - Fire Fighting Works at Garden Boulevard', 'Al Yamama', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2025-01-01'),
  ('101CD204', 'AL URUBA PARK - Fire Fighting Works at Visitors Building', 'Al Yamama', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2025-01-01'),
  ('101CD205', 'AL URUBA PARK - Supply and instalation of Waterfeatures', 'Al Yamama', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2025-01-01'),
  ('101CD206', 'KAP PRIMARY CULVERT', 'Modern Builders', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2025-01-01'),
  ('101CD207', 'KAP SECONDARY CULVERT', 'Modern Builders', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2025-01-01'),
  ('101CD208', 'KAP DEMOLITION', 'Modern Builders', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2025-01-01'),
  ('101CD209', 'KAP FINISHING WORK', 'Modern Builders', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2025-01-01'),
  ('101CD210', 'KAP RETAIL BUILDING', 'Modern Builders', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2025-01-01'),
  ('101CD211', 'KAP Techanical Building', 'Modern Builders', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2025-01-01'),
  ('101CD212', 'MBC-001-MBC Infrastructure Project', 'MBC', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2025-01-01'),
  ('101CD213', 'MBC TCR & MCR', 'MBC', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2025-01-01'),
  ('101CD214', 'MBC Completed Project cost and Mockup', 'MBC', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2025-01-01'),
  ('101CD215', 'Al-Qadisiyah Park - Water Features Works.', 'Al Fahad', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2025-01-01'),
  ('101CD216', 'Sports Boulevard Pitchmastic Water proofing', 'Al Mabani', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2025-01-01'),
  ('101CD217', 'Al Urubah Park-Puddle Flange', 'Al Yamama', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2025-01-01'),
  ('101CD226', 'Al Arabia Snag Works', 'Al Arabia', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2025-01-01'),
  ('101CD227', 'MBC Media-Water line', 'MBC', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2025-01-01'),
  ('101CD228', 'MBC Media- Logo', 'MBC', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2025-01-01'),
  ('101CD229', 'MBC Media - Uplink Cable Tray', 'MBC', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2025-12-01'),
  ('101CD230', 'MBC Studio Stage 2 & 3', 'MBC', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2025-01-01'),
  ('101CD231', 'MBC-Dismantling of GRP tank and fire pump', 'MBC', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2025-01-01'),
  ('101CD232', 'Lulu Diplomatic Quarters', 'LULU', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2025-01-01'),
  ('101CD239', 'Tree Grate', 'Al Mabani', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2025-01-01'),
  ('101CD240', 'Al Urubah Park - IT and Telecom Services', 'Al Yamama', 'Riyadh Villas Contracting', 'Dammam', 'Building Construction', 'active', 0, '2026-02-18'),
  ('101CD241', 'Al Arabia Phase 3', 'Al Arabia', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2026-01-01'),
  ('101CD242', 'AL Fahad - S/S Floor Drain', 'Al Fahad', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2026-01-01'),
  ('101CD243', 'Embassy Of Switzerland- Landscape refurbishment', 'Not specified', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2026-01-01'),
  ('101CD244', 'Al Urubah - Design review Addressable Fire Alaram', 'Al Yamama', 'Riyadh Villas Contracting', 'Dammam', 'Building Construction', 'active', 0, '2026-01-01'),
  ('101CD245', 'GEOTECHNICAL EARTHWORKS AT KING ABDULAZIZ PARK', 'Not specified', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2025-01-01'),
  ('101CD246', 'PMB W.P Thumama Road Central Section Tunnel TU6A', 'Al Mabani', 'Riyadh Villas Contracting', 'Jeddah', 'Building Construction', 'active', 0, '2026-06-01'),
  ('101CD247', 'Al Andalus Villa projects', 'Not specified', 'Riyadh Villas Contracting', 'Riyadh', 'Building Construction', 'active', 0, '2026-10-01'),
  ('101MF211', 'Yamama Palace Fence and gate', 'Al Yamama', 'Riyadh Villas Contracting', 'Riyadh', 'Metal Fabrication', 'active', 0, '2025-01-01'),
  ('101MF217', 'Sports Boulevard Linear Shade', 'Al Mabani', 'Riyadh Villas Contracting', 'Riyadh', 'Metal Fabrication', 'active', 0, '2025-01-01'),
  ('101MF222', 'Al Fanar- Construction of King Abdul Aziz Road', 'Al Fanar', 'Riyadh Villas Contracting', 'Riyadh', 'Metal Fabrication', 'active', 0, '2025-01-01'),
  ('101MF223', 'Al Fanar- HVDC Converter', 'Al Fanar', 'Riyadh Villas Contracting', 'Riyadh', 'Metal Fabrication', 'active', 0, '2025-01-01'),
  ('101MF224', 'Al Fanar-Embedded Plate', 'Al Fanar', 'Riyadh Villas Contracting', 'Riyadh', 'Metal Fabrication', 'active', 0, '2025-01-01'),
  ('101MF225', 'Riyadh Villas Metal Factory', 'Not specified', 'Riyadh Villas Contracting', 'Riyadh', 'Metal Fabrication', 'active', 0, '2025-01-01'),
  ('101MF231', 'Al Fanar HVDC Station PE 319', 'Al Fanar', 'Riyadh Villas Contracting', 'Riyadh', 'Metal Fabrication', 'active', 0, '2026-01-01'),
  ('101MF232', 'Qiddiya HDG Bracket', 'Not specified', 'Riyadh Villas Contracting', 'Riyadh', 'Metal Fabrication', 'active', 0, '2026-01-01'),
  ('101MF233', 'QIDDIYA TENNIS CENTER _ HDG MS', 'Not specified', 'Riyadh Villas Contracting', 'Riyadh', 'Metal Fabrication', 'active', 0, '2026-01-01'),
  ('101MF234', 'AL FANAR PE319C-135', 'Al Fanar', 'Riyadh Villas Contracting', 'Riyadh', 'Metal Fabrication', 'active', 0, '2026-01-01'),
  ('101MF235', 'AL FANAR PE318C-147', 'Al Fanar', 'Riyadh Villas Contracting', 'Riyadh', 'Metal Fabrication', 'active', 0, '2026-01-01'),
  ('101MF236', 'AL FANAR PE317C-144', 'Al Fanar', 'Riyadh Villas Contracting', 'Riyadh', 'Metal Fabrication', 'active', 0, '2026-01-01'),
  ('101MF237', 'AL FANAR PE316C-137', 'Al Fanar', 'Riyadh Villas Contracting', 'Riyadh', 'Metal Fabrication', 'active', 0, '2026-01-01'),
  ('101MF240', 'Mockup - RVMF', 'Not specified', 'Riyadh Villas Contracting', 'Riyadh', 'Metal Fabrication', 'active', 0, '2025-01-01'),
  ('101MF241', 'Al Fanar - PE345C-029 4800041173', 'Al Fanar', 'Riyadh Villas Contracting', 'Riyadh', 'Metal Fabrication', 'active', 0, '2026-03-01'),
  ('101MF242', 'Al Fanar PE-317-33 4900050476', 'Not specified', 'Riyadh Villas Contracting', 'Riyadh', 'Metal Fabrication', 'active', 0, '2026-01-01'),
  ('101MF243', 'Sports boluvard-Steel skirting', 'Not specified', 'Riyadh Villas Contracting', 'Jeddah', 'Metal Fabrication', 'active', 0, '2026-01-01'),
  ('101MF244', 'Manufacture and Supply of Bike Rack .', 'Not specified', 'Riyadh Villas Contracting', 'Riyadh', 'Metal Fabrication', 'active', 0, '2026-05-01'),
  ('101MF245', 'Additional Tower Canopy Columns-Variation order', 'Not specified', 'Riyadh Villas Contracting', 'Jeddah', 'Metal Fabrication', 'active', 0, '2026-06-01'),
  ('101MF246', 'Tree Support Brackets', 'Not specified', 'Riyadh Villas Contracting', 'Jeddah', 'Metal Fabrication', 'active', 0, '2026-09-01'),
  ('101MP218', 'Al Nahda Entertainment Complex-Shapporji Pallonji', 'Shapoorji Pallonji', 'Riyadh Villas Contracting', 'Riyadh', 'MEP Works', 'active', 0, '2025-01-01'),
  ('101MP219', 'Hotel West 03 Shura Island-Elegancia', 'Elegancia', 'Riyadh Villas Contracting', 'Riyadh', 'MEP Works', 'active', 0, '2025-01-01'),
  ('101MP220', 'Elegancia- Hotel West Shura Island DB Works', 'Not specified', 'Riyadh Villas Contracting', 'Riyadh', 'MEP Works', 'active', 0, '2025-01-01'),
  ('101MP221', 'Al Futtaim Engineering- DB Dressing', 'Al Futtaim', 'Riyadh Villas Contracting', 'Riyadh', 'MEP Works', 'active', 0, '2025-01-01'),
  ('101MP238', 'Riyadh Villas Contracting Co-MEP', 'Not specified', 'Riyadh Villas Contracting', 'Riyadh', 'MEP Works', 'active', 0, '2025-01-01'),
  ('101MP239', 'FGC Termination and Cladding', 'Not specified', 'Riyadh Villas Contracting', 'Riyadh', 'MEP Works', 'active', 0, '2026-03-01'),
  ('101MP240', 'STC Marriott Smart Hotel', 'Marriott', 'Riyadh Villas Contracting', 'Riyadh', 'MEP Works', 'active', 0, '2026-01-01'),
  ('101MP241', 'FAD Villa-MEP & Finishing Work.', 'Not specified', 'Riyadh Villas Contracting', 'Riyadh', 'MEP Works', 'active', 0, '2026-01-01'),
  ('101MP242', 'Al Urubah Park-RO Plant- Submersible Pump', 'Al Yamama', 'Riyadh Villas Contracting', 'Riyadh', 'MEP Works', 'active', 0, '2026-06-01')
on conflict (lower(code)) do nothing;

-- 3) project managers. First create each person as a user (Users page, or docs/DATA-QUERIES.sql section 3),
--    replace the EMAIL.* placeholders below with their real e-mails, then run steps 3 and 4.
create temp table pm_map (pm_name text, pm_email text);
insert into pm_map values
  ('Anil Kumar K.', 'EMAIL.anil@yourcompany.com'),
  ('Qais Hossam', 'EMAIL.qais@yourcompany.com'),
  ('Balaprassanna P.', 'EMAIL.balaprassanna@yourcompany.com'),
  ('Omprasad Raj', 'EMAIL.omprasad@yourcompany.com'),
  ('Eben George', 'EMAIL.eben@yourcompany.com'),
  ('Abdullah Khan', 'EMAIL.abdullah@yourcompany.com');

create temp table pm_projects (pm_name text, code text);
insert into pm_projects values
  ('Anil Kumar K.', '101CD201'),
  ('Anil Kumar K.', '101CD202'),
  ('Anil Kumar K.', '101CD203'),
  ('Anil Kumar K.', '101CD204'),
  ('Anil Kumar K.', '101CD205'),
  ('Anil Kumar K.', '101CD212'),
  ('Anil Kumar K.', '101CD213'),
  ('Anil Kumar K.', '101CD217'),
  ('Anil Kumar K.', '101CD227'),
  ('Anil Kumar K.', '101CD228'),
  ('Anil Kumar K.', '101CD229'),
  ('Anil Kumar K.', '101CD230'),
  ('Anil Kumar K.', '101CD231'),
  ('Anil Kumar K.', '101CD240'),
  ('Anil Kumar K.', '101MP219'),
  ('Qais Hossam', '101CD206'),
  ('Qais Hossam', '101CD207'),
  ('Qais Hossam', '101CD208'),
  ('Qais Hossam', '101CD209'),
  ('Qais Hossam', '101CD210'),
  ('Qais Hossam', '101CD211'),
  ('Balaprassanna P.', '101CD215'),
  ('Balaprassanna P.', '101CD242'),
  ('Balaprassanna P.', '101MP218'),
  ('Balaprassanna P.', '101MP220'),
  ('Balaprassanna P.', '101MP221'),
  ('Balaprassanna P.', '101MP238'),
  ('Balaprassanna P.', '101MP239'),
  ('Omprasad Raj', '101CD216'),
  ('Omprasad Raj', '101CD246'),
  ('Eben George', '101CD226'),
  ('Eben George', '101CD239'),
  ('Eben George', '101CD241'),
  ('Eben George', '101MP240'),
  ('Eben George', '101MP242'),
  ('Abdullah Khan', '101MF211'),
  ('Abdullah Khan', '101MF217'),
  ('Abdullah Khan', '101MF222'),
  ('Abdullah Khan', '101MF223'),
  ('Abdullah Khan', '101MF224'),
  ('Abdullah Khan', '101MF225'),
  ('Abdullah Khan', '101MF231'),
  ('Abdullah Khan', '101MF232'),
  ('Abdullah Khan', '101MF233'),
  ('Abdullah Khan', '101MF234'),
  ('Abdullah Khan', '101MF235'),
  ('Abdullah Khan', '101MF236'),
  ('Abdullah Khan', '101MF237'),
  ('Abdullah Khan', '101MF240'),
  ('Abdullah Khan', '101MF241'),
  ('Abdullah Khan', '101MF242'),
  ('Abdullah Khan', '101MF243'),
  ('Abdullah Khan', '101MF244');

-- 4) set the manager and add them to the project team with full project rights
update "proj-dashboard-projects" pr set project_manager_id = u.id
  from pm_projects pp join pm_map m on m.pm_name = pp.pm_name join "proj-dashboard-users" u on u.email = lower(m.pm_email)
 where lower(pr.code) = lower(pp.code);

insert into "proj-dashboard-project-members" (project_id, user_id, member_role, can_edit, can_upload, can_delete_docs, can_manage_team)
select pr.id, pr.project_manager_id, 'manager', true, true, true, true
  from "proj-dashboard-projects" pr join pm_projects pp on lower(pp.code) = lower(pr.code)
 where pr.project_manager_id is not null
on conflict (project_id, user_id) do nothing;

-- projects that still have no manager (blank in the sheet, or e-mail not created yet):
select code, name from "proj-dashboard-projects" where project_manager_id is null and deleted_at is null order by code;
