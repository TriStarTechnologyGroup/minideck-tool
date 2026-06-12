-- 0022_capabilities_enrich.sql — bring capabilities to parity with the TMA catalog.
-- Adds richer columns and seeds the canonical capability taxonomy (from the prospecting skill's
-- capability_taxonomy.md). The 10 existing CAP-01..10 rows are HubSpot-linked (hs_sku = capability_id),
-- so they are ENRICHED in place (never re-id'd); the 17 taxonomy rows with no CAP equivalent
-- (biospecimen cohorts R-, formats/data/imaging D-/F-, cohort services C-, re-characterization L-08)
-- are inserted. Idempotent.

alter table public.capabilities add column if not exists specs            text;
alter table public.capabilities add column if not exists matching_signal  text;   -- "suggest when…"
alter table public.capabilities add column if not exists solid_liquid     text;   -- Solid only / any (service) / …
alter table public.capabilities add column if not exists data_sheet       text;
alter table public.capabilities add column if not exists active           boolean not null default true;
alter table public.capabilities add column if not exists position         integer not null default 0;
alter table public.capabilities add column if not exists updated_at       timestamptz not null default now();

create index if not exists capabilities_category_idx on public.capabilities(category);

-- ── Enrich the 10 existing HubSpot-linked rows (category normalized + specs/signal/order) ──
update public.capabilities set category='Biospecimen', position=1,  solid_liquid='Solid',
  specs=coalesce(specs,'Re-sectionable FFPE blocks; ~500–900 donors/type; ethically sourced, consented, anonymized'),
  matching_signal=coalesce(matching_signal,'Tissue for assay dev / re-extraction; late-stage prevalence, biomarker, selection') where capability_id='CAP-01';
update public.capabilities set category='Biospecimen', position=2,  solid_liquid='Solid',
  specs=coalesce(specs,'FFPE + matched double-spun plasma; ~330 sets; NGS-eligible'),
  matching_signal=coalesce(matching_signal,'Tissue–plasma pairing, ctDNA biomarker, NGS concordance') where capability_id='CAP-02';
update public.capabilities set category='Format', position=3,  solid_liquid='Solid (some heme)',
  specs=coalesce(specs,'Multi-tumor, tumor-specific & custom TMAs; pre-characterized with IHC / NGS / RNA-Seq'),
  matching_signal=coalesce(matching_signal,'Rapid target-prevalence screening; novel-target ADC/IO') where capability_id='CAP-03';
update public.capabilities set category='Lab service', position=10, solid_liquid='any (service)',
  specs=coalesce(specs,'100+ optimized assays; Ventana/Dako; pathologist-scored'),
  matching_signal=coalesce(matching_signal,'Protein-target expression, CDx feasibility, PD markers') where capability_id='CAP-04';
update public.capabilities set category='Lab service', position=11, solid_liquid='any (service)',
  specs=coalesce(specs,'In-house RNA-ISH'),
  matching_signal=coalesce(matching_signal,'RNA-level target localization; targets lacking validated antibodies; ADC payload-target') where capability_id='CAP-05';
update public.capabilities set category='Lab service', position=12, solid_liquid='any (service)',
  specs=coalesce(specs,'Panel sequencing incl. Oncomine'),
  matching_signal=coalesce(matching_signal,'Genomic patient-selection / resistance / expanded profile') where capability_id='CAP-06';
update public.capabilities set category='Lab service', position=13, solid_liquid='any (service)',
  specs=coalesce(specs,'Bulk transcriptomics'),
  matching_signal=coalesce(matching_signal,'IO / inflamed signatures, resistance / pathway') where capability_id='CAP-07';
update public.capabilities set category='Lab service', position=14, solid_liquid='Solid (service)',
  specs=coalesce(specs,'Spatial proteomic / transcriptomic profiling'),
  matching_signal=coalesce(matching_signal,'Spatial target & TME — IO, bispecific/TCE, myeloid') where capability_id='CAP-08';
update public.capabilities set category='Lab service', position=15, solid_liquid='any (service)',
  specs=coalesce(specs,'Quantitative / AI image scoring'),
  matching_signal=coalesce(matching_signal,'Quantitative IHC/IF scoring, AI datasets') where capability_id='CAP-09';
update public.capabilities set category='Lab service', position=16, solid_liquid='any (service)',
  specs=coalesce(specs,'Ex-pharma pathologists; expert review'),
  matching_signal=coalesce(matching_signal,'Scoring design, expert read, QC') where capability_id='CAP-10';

-- ── Seed the 17 canonical taxonomy rows with no CAP equivalent ──
insert into public.capabilities (capability_id, name, category, specs, solid_liquid, matching_signal, description, position) values
  ('R-01','Advanced-stage (III/IV) surgical FFPE','Biospecimen','~500–900 donors/type; FFPE/TMA/slides; tx/response/OS-PFS; mutations; IHC markers','Solid','Covered solid tumor needing late-stage tissue for prevalence / biomarker / selection',null,20),
  ('R-02','Longitudinal same-donor sets','Biospecimen','~20–70 / indication','Solid','Resistance / on-treatment dynamics in a covered solid tumor',null,21),
  ('R-03','Primary + matched distant mets','Biospecimen','~20–50 / indication; LN/bone/liver/lung/brain/peritoneal','Solid','Metastatic disease, organotropism, primary-vs-met heterogeneity (ADCs)',null,22),
  ('R-04','Pre/Post-SOC sets','Biospecimen','~25–150 / indication','Solid','Combination-with/after-SOC, PD vs SOC, SOC resistance',null,23),
  ('R-05','Pre/Post-IO (pembro/nivo) sets','Biospecimen','~10–25; NSCLC/RCC/HNSCC/melanoma','Solid','IO programs (checkpoint, TCE, myeloid, LAG-3/TIGIT/OX40/PD-1, HPK1)',null,24),
  ('R-07','Matched normal tissue','Biospecimen','Paired with tumor','Solid','Tumor-vs-normal specificity, on-target/off-tumor safety (ADC/bispecific/CAR-T)',null,25),
  ('F-03','Slides','Format','Ready-to-stain','Solid','Immediate IHC / ISH',null,30),
  ('L-08','Re-characterization on archival blocks','Lab service','Re-stain / extract / seq','Solid','Add new markers to an existing TriStar-annotated cohort',null,17),
  ('D-01','Clinical outcome annotation','Data','tx / response / OS / PFS / TTE / event flags','Solid','Outcome-correlated biomarker / patient-selection',null,40),
  ('D-02','Molecular / genomic annotation','Data','KRAS, NRAS, EGFR, ALK, BRAF, BRCA, MET, HRD, MSI; FISH; RNA-ISH; NGS','Solid','Target/biomarker in set or genomic stratification',null,41),
  ('D-03','Pre-characterized IHC marker data','Data','ER/PR, HER2, MMR, PD-L1, TROP2, Nectin-4, B7-H3, B7-H4, DLL3, p16, p53','Solid','HIGH-VALUE: program target equals one of these markers',null,42),
  ('D-04','Whole-slide H&E library','Imaging','30k donors; >100k .svs; 40×; Aperio; pathologist-reviewed','Solid','Morphology / WSI, digital / AI pathology, image biomarkers',null,43),
  ('D-05','Radiology imaging (roadmap)','Imaging','In development','Solid','Flag as forthcoming only',null,44),
  ('D-06','Patient-level multimodal linkage','Data model','imaging ↔ block ↔ clinical ↔ molecular; anonymized','Solid','Integrated multimodal datasets; IND / regulatory provenance',null,45),
  ('C-01','Custom / maintained cohort design','Cohort service','To protocol','Solid','Bespoke translational cohort to indication / stage / line / biomarker',null,50),
  ('C-02','Cohort expansion / complement','Cohort service','Add donors','Solid','Existing cohort short on N',null,51),
  ('C-03','Expanded molecular profiling','Cohort service','Larger / newer panel; same patients','Solid','Deeper / updated profiling on an existing cohort as biomarkers evolve',null,52)
on conflict (capability_id) do nothing;
