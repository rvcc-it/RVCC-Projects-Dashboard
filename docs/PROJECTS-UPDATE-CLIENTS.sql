-- =====================================================================================================
-- Full client names from the "Contract Identification" sheet (Client column). Run AFTER PROJECTS-INSERT.sql step 2.
-- Replaces the short names / "Not specified" set by the first import. Safe to re-run.
-- Names that the screenshot cut off were completed (marked "completed" below) - check them against the sheet.
-- =====================================================================================================
update "proj-dashboard-projects" p set client_name = v.client_name
  from (values
    -- Al Yamama Company For Trading (completed)
    ('101CD201','Al Yamama Company For Trading'), ('101CD202','Al Yamama Company For Trading'), ('101CD203','Al Yamama Company For Trading'),
    ('101CD204','Al Yamama Company For Trading'), ('101CD205','Al Yamama Company For Trading'), ('101CD217','Al Yamama Company For Trading'),
    ('101CD240','Al Yamama Company For Trading'), ('101CD244','Al Yamama Company For Trading'),
    ('101MP242','Al Yamama Company For Trading'),
    -- Al Arabiya Media Network (completed)
    ('101CD226','Al Arabiya Media Network'), ('101CD241','Al Arabiya Media Network'),
    -- Modern Building Leaders Company (completed)
    ('101CD206','Modern Building Leaders Company'), ('101CD207','Modern Building Leaders Company'), ('101CD208','Modern Building Leaders Company'),
    ('101CD209','Modern Building Leaders Company'), ('101CD210','Modern Building Leaders Company'), ('101CD211','Modern Building Leaders Company'),
    ('101MF211','Modern Building Leaders Company'),   -- sheet: client of this contract differs from its L2 code
    -- MBC Media Ksa Ltd.
    ('101CD212','Mbc Media Ksa Ltd.'), ('101CD213','Mbc Media Ksa Ltd.'), ('101CD214','Mbc Media Ksa Ltd.'), ('101CD227','Mbc Media Ksa Ltd.'),
    ('101CD228','Mbc Media Ksa Ltd.'), ('101CD229','Mbc Media Ksa Ltd.'), ('101CD230','Mbc Media Ksa Ltd.'), ('101CD231','Mbc Media Ksa Ltd.'),
    -- Al-fahd Co Trading Industries
    ('101CD215','Al-fahd Co Trading Industries'), ('101CD242','Al-fahd Co Trading Industries'),
    -- Almabani General Contractors
    ('101CD216','Almabani General Contractors'), ('101CD239','Almabani General Contractors'), ('101CD246','Almabani General Contractors'),
    ('101MF217','Almabani General Contractors'), ('101MF243','Almabani General Contractors'), ('101MF244','Almabani General Contractors'),
    ('101MF245','Almabani General Contractors'), ('101MF246','Almabani General Contractors'),
    -- Al Fanar Company Ltd.
    ('101MF222','Al Fanar Company Ltd.'), ('101MF223','Al Fanar Company Ltd.'), ('101MF224','Al Fanar Company Ltd.'), ('101MF231','Al Fanar Company Ltd.'),
    ('101MF234','Al Fanar Company Ltd.'), ('101MF235','Al Fanar Company Ltd.'), ('101MF236','Al Fanar Company Ltd.'), ('101MF237','Al Fanar Company Ltd.'),
    ('101MF241','Al Fanar Company Ltd.'),
    -- single-client projects
    ('101CD243','Embassy of Switzerland'),
    ('101CD245','Armada Limited'),
    ('101MF225','HAIF Trading and Contracting'),                   -- completed
    ('101MF232','Greenshore International Trading'),               -- completed
    ('101MF233','QTC Joint Venture'),                              -- completed (sheet: "QTC Joint Venture(Qiddiya Ten...")
    ('101MP218','Shapoorji Pallonji Mideast (L.L.C)'),             -- completed
    ('101MP219','Elegancia Arabic Trading Company'), ('101MP220','Elegancia Arabic Trading Company'),   -- completed
    ('101MP221','Al Futtaim Engineering Technologies'),            -- completed
    ('101MP239','First Gulf Contracting Company'),                 -- completed
    ('101MP240','AlSaad General Contracting Co.')                  -- completed
  ) as v(code, client_name)
 where lower(p.code) = lower(v.code);
