// Seed the "ASCO 2026 Follow-up" ABM campaign from the playbook.
// Creates the campaign + 9 accounts, reusing the EXISTING deck tokens (activates
// tracking for them), upserts the 14 contacts (DB + HubSpot, NO link note), and
// loads the 3 touch drafts per account.
//   node --env-file=.env.local scripts/seed-asco-campaign.mjs
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HS = process.env.HUBSPOT_TOKEN;
const PORTAL = process.env.HUBSPOT_PORTAL_ID;
const sh = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
const sb = (p, o = {}) => fetch(`${SB}/rest/v1/${p}`, { headers: sh, ...o });
const sbJson = async (p, o = {}) => (await sb(p, o)).json();
const hapi = (p, o = {}) => fetch(`https://api.hubapi.com${p}`, { headers: { Authorization: `Bearer ${HS}`, "Content-Type": "application/json" }, ...o });

const SIG = "Best regards,\nShaan Bhagat\nDirector of Digital Strategy, TriStar Technology Group\nsm.bhagat@tristargroup.us · +1 866 851 7827 · tristargroup.us";
const INTRO = "By way of brief background, TriStar has built a fit for purpose repository of samples, data and images to support translational medicine programs in oncology.";

// helper to assemble a 3-touch set with shared follow-ups
const touches = (t1subject, t1body, t2body, t3body, followSubject) => ([
  { seq: 1, day_offset: 0, subject: t1subject, body: t1body },
  { seq: 2, day_offset: 4, subject: followSubject, body: t2body },
  { seq: 3, day_offset: 9, subject: followSubject, body: t3body },
]);

const ACCOUNTS = [
  {
    name: "Lunit", token: "z7uTqQhj", warmth: "hot",
    contacts: [
      { first_name: "Chang Ho", last_name: "Ahn", position: "VP, Division of Medicine", company: "Lunit", email: "ahncho@lunit.io", role: "to", is_primary: true },
      { first_name: "Wonkyung", last_name: "Jung", position: "Team Leader & Pathologist, Medical Data Management", company: "Lunit", email: "wkjung@lunit.io", role: "to", is_primary: false },
      { first_name: "Marie", last_name: "Cumberbatch", position: "Head of Projects & IO Applications", company: "TriStar", email: "m.cumberbatch@tristargroup.us", role: "cc", is_primary: false },
    ],
    research: "Public (Korea) medical AI company. Lunit SCOPE (oncology pathology AI for immune and tumor microenvironment analysis, IHC suite, PD-L1, HER2, genotype prediction) and Lunit INSIGHT (radiology screening). Acquired Volpara (2025). AI biomarker collaboration with Daiichi Sankyo (Dec 2025). Moving toward foundation models.",
    context: "Met with Marie at ASCO; impressed with the repository; asked to reconnect on a few projects. Only pushback was price sensitivity, so lead with specialized, hard to source value rather than price.",
    angle: "Lunit SCOPE biomarker and genotype work. Whole slide H&E images reviewed by pathologists linked to treatment, response and survival plus molecular annotation; matched PD-L1 and HER2 IHC; responder and non responder cohorts; DSP for orthogonal work.",
    t: touches(
      "Reconnecting after ASCO",
      `Hi Dr. Ahn and Dr. Jung,\n\nIt was a pleasure meeting you and Marie at ASCO, and I'm glad the repository resonated.\n\n${INTRO}\n\nGiven Lunit SCOPE's biomarker and genotype work, a few of our assets may be relevant: whole slide H&E images reviewed by pathologists and linked to treatment, response and survival alongside molecular annotation, and matched PD-L1 and HER2 IHC with responder and non responder cohorts, with DSP available for orthogonal work.\n\nYou can find an overview of our work here: {{LINK}}\n\nI'd welcome the opportunity to reconnect and explore which of your priorities we might be able to support.\n\n${SIG}`,
      "Following up on my note in case it's helpful. At this stage I'd mainly be interested to learn more about the projects your team is working on where our repository of samples, data and images could be useful.",
      "I'll leave this with you for now. We're genuinely interested in supporting Lunit's work where it's useful, and the door is open whenever you'd like to pick it back up. Happy to share a short cohort summary for your team at any point.",
      "Re: Reconnecting after ASCO",
    ),
  },
  {
    name: "Imagene AI", token: "8kEoOfhW", warmth: "warm",
    contacts: [
      { first_name: "Daniel", last_name: "(Data)", position: "Data", company: "Imagene AI", email: "daniel@imagene-ai.com", role: "to", is_primary: true },
      { first_name: "Brian", last_name: "Laffin", position: "Head of Translational and Clinical Strategy", company: "Imagene AI", email: "brian.laffin@imagene-ai.com", role: "cc", is_primary: false },
      { first_name: "Dean", last_name: "Bitan", position: "CEO", company: "Imagene AI", email: "dean@imagene-ai.com", role: "cc", is_primary: false },
    ],
    research: "AI precision oncology; multimodal foundation model (OI Suite, model CanvOI) predicting molecular biomarkers and response from H&E in real time. Collaborations with Tempus and Daiichi Sankyo; backed by Oracle and Ellison. Breast, colorectal and lung benchmarks.",
    context: "Cold pitch at ASCO landed; CEO Dean routed you to Daniel on the data side; Brian Laffin asked to be cc'd.",
    angle: "Morphology to molecular foundation model (OI Suite and CanvOI). H&E whole slide images with matched molecular annotation (NGS for SNV, CNV, fusions; IHC across EGFR, KRAS, ALK, BRAF, HRD, MSI) and outcomes; pre characterized TMAs for fast validation sets in breast, colorectal and lung.",
    t: touches(
      "Following up from ASCO",
      `Hi Daniel,\n\nDean kindly suggested I reach you directly, and I'm copying Brian and Dean. It was good to connect with the Imagene team at ASCO.\n\n${INTRO}\n\nWith your OI Suite and CanvOI work predicting molecular biomarkers from H&E, some of our assets may be a useful fit: whole slide H&E images with matched molecular annotation (NGS for SNV, CNV and fusions, plus IHC across EGFR, KRAS, ALK, BRAF, HRD and MSI) and linked treatment and survival data, along with pre characterized TMAs for validation across breast, colorectal and lung.\n\nYou can find an overview of our work here: {{LINK}}\n\nI'd welcome the opportunity to connect and explore where we might be able to support your roadmap.\n\n${SIG}`,
      "Following up in case it's helpful. At this stage I'd mainly be interested to learn more about the projects your team is working on where our repository of samples, data and images could be useful.",
      "I'll leave this with you for now. We're happy to share a one page summary of the relevant cohorts whenever it's helpful, and glad to reconnect at any point.",
      "Re: Following up from ASCO",
    ),
  },
  {
    name: "Exai", token: "MAieBRSC", warmth: "warm",
    contacts: [{ first_name: "Michael", last_name: "Nall", position: "CEO", company: "Exai", email: "michaeln@exai.bio", role: "to", is_primary: true }],
    research: "RNA and AI liquid biopsy company (not imaging). Detects and characterizes cancer from a blood draw using orphan non coding RNA (oncRNA) biomarkers in plasma plus a generative AI cfRNA model (Exai-1). UCSF linked; recent breast cancer early detection data from roughly 1 mL of plasma; Nature publication on the cfRNA model.",
    context: "Their scientific cofounder and Shaan had a strong conversation at ASCO; cofounder suggested reaching the CEO directly.",
    angle: "cfRNA liquid biopsy classifier (Exai-1) training and validation. Matched double spun plasma from annotated donors, with paired tissue for orthogonal characterization and linked treatment and survival data; samples to expand access as they scale. Lead with supporting their efforts through the repository; no paper pitch.",
    t: touches(
      "Following up from ASCO",
      `Hi Michael,\n\nYour scientific cofounder and I had a great conversation at ASCO, and they suggested I reach you directly.\n\n${INTRO}\n\nFor Exai's cfRNA work, our most relevant assets are matched, double spun plasma sets from annotated donors, with paired tissue for orthogonal characterization and linked treatment and survival data, well suited to training and validating cfRNA classifiers, along with the samples to expand as you scale.\n\nYou can find an overview of our work here: {{LINK}}\n\nI'd welcome the opportunity to connect and explore how our repository might support your efforts.\n\n${SIG}`,
      "Following up in case it's helpful. At this stage I'd mainly be interested to learn more about the work your team is focused on where our samples and data could be useful.",
      "I'll leave this with you for now. The matched plasma and tissue look like a strong fit for Exai's work, so I'd welcome the chance to reconnect whenever it's helpful.",
      "Re: Following up from ASCO",
    ),
  },
  {
    name: "Nucleai", token: "BrfifO4s", warmth: "warm",
    contacts: [{ first_name: "Sharon", last_name: "Elkobi", position: "", company: "Nucleai", email: "sharon.elkobi@nucleai.ai", role: "to", is_primary: true }],
    research: "Spatial biomarker AI for biopharma; Spatial Inference Platform analyzing tissue with spatial biology and AI to discover predictive biomarkers. Strong focus on ADC and bispecific target qualification and biomarker scoring; co developed a spatial biology workflow with Bio-Techne (melanoma). NSCLC and melanoma named; works with many of the top 20 biopharma.",
    context: "Spoke at ASCO; agreed next step is to send the deck and find time to connect.",
    angle: "Spatial AI for ADC and bispecific biomarkers. Pre characterized TMAs and FFPE with multiplex IHC and whole slide images reviewed by pathologists, plus in house Digital Spatial Profiling and RNAScope; responder and non responder cohorts in NSCLC and melanoma.",
    t: touches(
      "Following up from ASCO (deck enclosed)",
      `Hi Sharon,\n\nIt was good speaking at ASCO. As promised, here is our overview deck: {{LINK}}\n\n${INTRO}\n\nFor Nucleai's spatial work, including the ADC and bispecific biomarker scoring you focus on, the assets that may fit best are our annotated tissue paired with in house Digital Spatial Profiling, multiplex IHC and RNAScope, alongside whole slide images reviewed by pathologists, on donors with treatment, survival and molecular data across indications such as NSCLC and melanoma.\n\nI'd welcome the opportunity to connect and explore where we might be able to support your work.\n\n${SIG}`,
      "Following up in case it's helpful. At this stage I'd mainly be interested to learn more about the projects your team is working on where our repository of samples, data and images could be useful.",
      "I'll leave this with you for now. Happy to share a short spatial cohort summary for the team whenever it's useful, and glad to reconnect at any point.",
      "Re: Following up from ASCO",
    ),
  },
  {
    name: "BostonGene", token: "QgFEEag6", warmth: "warm",
    contacts: [{ first_name: "Tamara", last_name: "Laskowski", position: "VP, Academic Alliances and Strategic Collaborations", company: "BostonGene", email: "tamara.laskowski@bostongene.com", role: "to", is_primary: true }],
    research: "Multiomic oncology analytics and precision testing; products include Tumor Portrait, liquid biopsy, IHC and unknown primary tests; in house high complexity lab (WES, whole transcriptome, cfDNA and cfRNA, single cell RNA sequencing, flow, spatial proteomics, digital pathology) plus AI and digital twin modeling. Strategic partnership with AstraZeneca (Jan 2026); collaborations including Daiichi Sankyo.",
    context: "After the cold pitch you were routed to Tamara as the right owner; she is roughly one month into the role.",
    angle: "Multiomic model validation and pharma partner programs. FFPE and matched plasma on donors with NGS, RNA sequencing, IHC and linked treatment and survival data; validation cohorts and biospecimens for multiomic models, with the option to expand profiling on the same matched samples. Multi tumor and immunotherapy cohorts available. Frame around academic alliances and strategic collaboration.",
    t: touches(
      "Following up from ASCO",
      `Hi Tamara,\n\nI was pointed to you as the right person for academic alliances and strategic collaborations, and congratulations on the new role.\n\n${INTRO}\n\nOur work may complement BostonGene's multiomic profiling: FFPE and matched plasma on donors with NGS, RNA sequencing, IHC and linked treatment and survival data, useful as validation cohorts for your models and pharma partner programs, with the option to expand profiling on the same matched samples. Multi tumor and immunotherapy cohorts are available.\n\nYou can find an overview of our work here: {{LINK}}\n\nI'd welcome the opportunity to connect and explore where our samples and data might support your profiling and collaborations.\n\n${SIG}`,
      "Following up in case it's helpful. At this stage I'd mainly be interested to learn more about the programs your team is working on where our samples and data could be useful.",
      "I'll leave this with you for now. Glad to send a one page summary of matched molecular and tissue cohorts for you to keep on file whenever it's helpful.",
      "Re: Following up from ASCO",
    ),
  },
  {
    name: "ConcertAI", token: "TMigZwKo", warmth: "warm",
    contacts: [
      { first_name: "Bob", last_name: "Zambon", position: "VP, Product, Clinical Trials", company: "ConcertAI", email: "b.zambon@concertai.com", role: "to", is_primary: true },
      { first_name: "Caitlin", last_name: "Tibbs", position: "Sr Director, Product Management", company: "ConcertAI", email: "c.tibbs@concertai.com", role: "cc", is_primary: false },
      { first_name: "Simran", last_name: "Bhatia", position: "Data Science", company: "ConcertAI", email: "s.bhatia@concertai.com", role: "cc", is_primary: false },
    ],
    research: "Oncology real world data and AI SaaS company; orchestrates clinical data, real world data and applied AI for life sciences (including CancerLinQ data). Expanding into enterprise imaging and computational pathology and agentic AI. Strategic precision oncology agreement with Bayer (2025).",
    context: "Pitched the clinical trials and data science team; they asked you to follow up and said they would follow up too.",
    angle: "Real world data and trials, now adding enterprise imaging. Outcome annotated FFPE, TMAs and whole slide images reviewed by pathologists with molecular data; biomarker stratified cohorts for trial design and translational endpoints that complement EHR derived real world data.",
    t: touches(
      "Following up from ASCO",
      `Hi Bob (and cc Caitlin and Simran),\n\nIt was good to meet the clinical trials and data science team at ASCO.\n\n${INTRO}\n\nAs ConcertAI expands into enterprise imaging and computational pathology, the linked tissue and imaging that sits alongside real world data may be useful: outcome annotated FFPE, TMAs and whole slide images reviewed by pathologists with molecular data, available as biomarker stratified cohorts for trial design and translational endpoints.\n\nYou can find an overview of our work here: {{LINK}}\n\nI'd welcome the opportunity to connect and explore a few concrete use cases across your trials and imaging work.\n\n${SIG}`,
      "Following up in case it's helpful. At this stage I'd mainly be interested to learn more about the projects your team is working on where our repository of samples, data and images could be useful.",
      "I'll leave this with you for now. Happy to send a one page summary for the team to review whenever it's useful, and glad to reconnect at any point.",
      "Re: Following up from ASCO",
    ),
  },
  {
    name: "Artera", token: "8hMsrilO", warmth: "warm",
    contacts: [{ first_name: "Nate", last_name: "Wade", position: "", company: "Artera", email: "nathaniel.wade@artera.ai", role: "to", is_primary: true }],
    research: "FDA authorized multimodal AI (MMAI) precision oncology; ArteraAI Prostate Test (FDA De Novo, Aug 2025, expanded to mHSPC) and ArteraAI Breast Test (FDA cleared, May 2026, first FDA cleared digital pathology breast risk tool). Builds predictive and prognostic tests from existing H&E and clinical data; notably does not consume tissue; in NCCN prostate guidelines; validated across many phase III randomized trials.",
    context: "Expressed interest in our dataset and possible collaboration next steps.",
    angle: "MMAI multimodal tests in prostate and breast. Whole slide H&E images reviewed by pathologists, linked to outcomes (survival, recurrence, and Gleason for prostate) and molecular annotation; dedicated prostate cohorts (hormone refractory, Gleason scored) and breast cohorts.",
    t: touches(
      "Following up from ASCO",
      `Hi Nate,\n\nFollowing up on your interest in our dataset at ASCO.\n\n${INTRO}\n\nGiven ArteraAI's multimodal tests in prostate and breast, some of our assets may be a useful fit: whole slide H&E images reviewed by pathologists, linked to treatment and outcomes (survival, recurrence, and Gleason for prostate) and molecular annotation, including dedicated prostate cohorts (with hormone refractory and Gleason scored cases) and breast cohorts.\n\nYou can find an overview of our work here: {{LINK}}\n\nI'd welcome the opportunity to connect and explore next steps on data and a potential collaboration.\n\n${SIG}`,
      "Following up in case it's helpful. At this stage I'd mainly be interested to learn more about the programs your team is working on where our repository of samples, data and images could be useful.",
      "I'll leave this with you for now. Happy to send a one page cohort summary for the team whenever it's helpful.",
      "Re: Following up from ASCO",
    ),
  },
  {
    name: "1Cell.AI", token: "fmpyC5W2", warmth: "light",
    contacts: [{ first_name: "Ajay", last_name: "Pandita", position: "VP, Scientific Affairs, Data and Sample Acquisition", company: "1Cell.AI", email: "ajay.pandita@1cell.ai", role: "to", is_primary: true }],
    research: "Precision oncology diagnostics combining single cell multiomics and AI (formerly OneCell Diagnostics). OncoIndx (AI powered comprehensive genomic profiling, NGS) plus a live circulating tumor cell biopsy platform; tissue, liquid and single cell data. Foster City, CA and Pune, India; oversubscribed 16M USD Series A (2025).",
    context: "Ajay was not present at ASCO; a colleague pointed you to him as the owner for data and sample acquisition, so open with a brief introduction.",
    angle: "Orthogonal validation and benchmarking for single cell and OncoIndx. Matched FFPE tissue and double spun plasma from the same donor with linked molecular and clinical annotation; in house NGS and RNA sequencing on the same samples.",
    t: touches(
      "Introduction following ASCO",
      `Hi Ajay,\n\nA colleague of yours suggested I reach out following ASCO, where we connected with the 1Cell.AI team.\n\n${INTRO}\n\nFor 1Cell.AI's single cell multiomics and OncoIndx work, our most relevant assets are matched FFPE tissue and double spun plasma from the same donor with linked molecular and clinical annotation, useful for orthogonal validation of single cell and circulating tumor cell findings and for benchmarking OncoIndx against established tissue profiling, with in house NGS and RNA sequencing available on the same samples.\n\nYou can find an overview of our work here: {{LINK}}\n\nI'd welcome the opportunity to connect and explore where we might be able to support your work.\n\n${SIG}`,
      "Following up in case it's helpful. At this stage I'd mainly be interested to learn more about the work your team is focused on where our samples and data could be useful.",
      "I'll leave this with you for now. Glad to send a one page summary of the matched tissue and plasma sets for your team whenever it's helpful.",
      "Re: Introduction following ASCO",
    ),
  },
  {
    name: "Advanced Clinical", token: "krdV6Fua", warmth: "warm",
    contacts: [{ first_name: "Elizabeth", last_name: "Dugan", position: "", company: "Advanced Clinical", email: "edugan@advancedclinical.com", role: "to", is_primary: true }],
    research: "Global clinical research services and strategic resourcing organization: CRO, Functional Service Provider and staffing, supporting sponsors across Phases I to IV; oncology is a stated core strength. New President and CEO Julie Ross (Sep 2025).",
    context: "Connected briefly with Elizabeth and her team at ASCO; she raised that it could be worthwhile to explore how TriStar might support prospective clients who reach Advanced Clinical at the translational stage.",
    angle: "Relationship and referral conversation, led by her own opener. Position TriStar as a specialized biospecimen and lab partner for the translational stage needs of their prospective clients. Link the deck and the main website.",
    t: touches(
      "Following up from ASCO",
      `Hi Elizabeth,\n\nIt was a pleasure connecting with you and your team briefly at ASCO. I hope our discussion on AI initiatives was helpful.\n\nYou had mentioned it could be worthwhile to explore how TriStar might support some of the prospective clients who come to Advanced Clinical at the translational stage, and I'd welcome the opportunity to do that.\n\n${INTRO} Our laboratory services include IHC, NGS, RNA sequencing and pathology review.\n\nYou can find an overview of our work here: {{LINK}}, and more on our broader capabilities at tristargroup.us.\n\nI'd welcome the chance to reconnect whenever it suits you.\n\n${SIG}`,
      "Following up on my note in case it's helpful. I'd mainly be interested to understand the sorts of translational needs your prospective clients tend to raise, and where our repository might support them.",
      "I'll leave this with you for now. The door is open whenever a relevant client need comes up, and I'm happy to share more at any point.",
      "Re: Following up from ASCO",
    ),
  },
];

async function main() {
  // admin profile for created_by
  const prof = (await sbJson("profiles?select=id&order=created_at.asc&limit=1"))[0];
  const createdBy = prof?.id ?? null;

  // AI deck
  const deck = (await sbJson("decks?slug=eq.ai-cohorts&select=id,base_url"))[0];
  if (!deck) { console.error("✗ ai-cohorts deck not found"); process.exit(1); }

  // idempotency: bail if campaign already exists
  const existing = await sbJson("campaigns?select=id&name=eq.ASCO%202026%20Follow-up");
  if (existing.length) { console.log(`Campaign already seeded (${existing[0].id}). Delete it in-app to reseed.`); process.exit(0); }

  const campaign = (await sbJson("campaigns", { method: "POST", headers: { ...sh, Prefer: "return=representation" },
    body: JSON.stringify({ name: "ASCO 2026 Follow-up", deck_id: deck.id, sender_label: "Shaan Bhagat", created_by: createdBy }) }))[0];
  console.log(`✓ campaign ${campaign.id}`);

  for (const a of ACCOUNTS) {
    const account = (await sbJson("accounts", { method: "POST", headers: { ...sh, Prefer: "return=representation" },
      body: JSON.stringify({ campaign_id: campaign.id, name: a.name, warmth: a.warmth, research: a.research, context: a.context, angle: a.angle }) }))[0];

    let primaryContactId = null;
    for (const c of a.contacts) {
      // HubSpot upsert (no note) → hubspot_id
      let hsId = null;
      try {
        const s = await hapi(`/crm/v3/objects/contacts/search`, { method: "POST", body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: c.email }] }], properties: ["email"], limit: 1 }) });
        const found = s.ok ? (await s.json()).results?.[0] : null;
        if (found) hsId = found.id;
        else {
          const cr = await hapi(`/crm/v3/objects/contacts`, { method: "POST", body: JSON.stringify({ properties: { email: c.email, firstname: c.first_name, lastname: c.last_name, jobtitle: c.position || "", company: c.company || "" } }) });
          if (cr.ok) hsId = (await cr.json()).id;
        }
      } catch { /* best-effort */ }
      const hsUrl = hsId ? `https://app.hubspot.com/contacts/${PORTAL}/contact/${hsId}` : null;

      // DB upsert by email
      const ex = await sbJson(`contacts?email=eq.${encodeURIComponent(c.email)}&select=id`);
      let contactId;
      if (ex.length) {
        contactId = ex[0].id;
        await sb(`contacts?id=eq.${contactId}`, { method: "PATCH", body: JSON.stringify({ first_name: c.first_name, last_name: c.last_name, position: c.position || null, company: c.company || null, hubspot_id: hsId, hubspot_url: hsUrl }) });
      } else {
        contactId = (await sbJson("contacts", { method: "POST", headers: { ...sh, Prefer: "return=representation" },
          body: JSON.stringify({ first_name: c.first_name, last_name: c.last_name, position: c.position || null, company: c.company || null, email: c.email, hubspot_id: hsId, hubspot_url: hsUrl, created_by: createdBy }) }))[0].id;
      }
      await sb("account_contacts", { method: "POST", headers: { ...sh, Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({ account_id: account.id, contact_id: contactId, role: c.role, is_primary: c.is_primary }) });
      if (c.is_primary) primaryContactId = contactId;
    }

    // account link with the EXISTING token (no note)
    const fullUrl = `${deck.base_url.replace(/\/+$/, "")}/?t=${a.token}`;
    let linkId;
    const exLink = await sbJson(`links?token=eq.${a.token}&select=id`);
    if (exLink.length) {
      linkId = exLink[0].id;
      await sb(`links?id=eq.${linkId}`, { method: "PATCH", body: JSON.stringify({ account_id: account.id, contact_id: primaryContactId }) });
    } else {
      linkId = (await sbJson("links", { method: "POST", headers: { ...sh, Prefer: "return=representation" },
        body: JSON.stringify({ token: a.token, deck_id: deck.id, contact_id: primaryContactId, full_url: fullUrl, account_id: account.id, created_by: createdBy }) }))[0].id;
    }
    await sb(`accounts?id=eq.${account.id}`, { method: "PATCH", body: JSON.stringify({ link_id: linkId }) });

    // touches (link injected into bodies)
    const rows = a.t.map((t) => ({ account_id: account.id, seq: t.seq, day_offset: t.day_offset, subject: t.subject, body: t.body.replace(/\{\{LINK\}\}/g, fullUrl) }));
    await sb("touches", { method: "POST", body: JSON.stringify(rows) });

    console.log(`  ✓ ${a.name} (${a.token}) — ${a.contacts.length} contact(s)`);
  }
  console.log("\n✓ ASCO campaign seeded.");
}
main().catch((e) => { console.error(e); process.exit(1); });
