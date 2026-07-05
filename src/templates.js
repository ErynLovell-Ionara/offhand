// Offhand template definitions. Templates are data, not code.
// Field types: text, longtext, number, list (array of strings), lineitems (array of {description, quantity, unit, rate})

export const TEMPLATES = [
  {
    id: "spray_record",
    name: "Spray record",
    tagline: "NZS 8409:2021 agrichemical application record",
    promptBlock: `This is an agrichemical application (spray) record per NZS 8409:2021.
Products may be stated with rates like "glyphosate 540 at three litres a hectare" -> product "Glyphosate 540", rate "3 L/ha".
Water rate is litres of water per hectare. Wind is speed and direction ("southwest about eight kays" -> direction SW, speed 8 km/h).
Buffer or sensitive-area statements ("kept ten metres off the drain") go in sensitive_areas.
Times like "started half twelve, done by two" -> start_time "12:30", finish_time "14:00".
If more than one distinct spray job or property is described, set flags.multi_job true.`,
    fields: [
      { key: "client", label: "Client", type: "text", required: true },
      { key: "property_block", label: "Property / block", type: "text", required: true, hint: "Where exactly the application happened" },
      { key: "products", label: "Products and rates", type: "list", required: true, hint: "One entry per product, with rate" },
      { key: "water_rate", label: "Water rate (L/ha)", type: "text", required: false },
      { key: "area_treated", label: "Area treated (ha)", type: "text", required: true },
      { key: "target", label: "Target pest / weed / disease", type: "text", required: true },
      { key: "method", label: "Application method / equipment", type: "text", required: true, hint: "Boom, gun, aerial, knapsack..." },
      { key: "wind_speed", label: "Wind speed", type: "text", required: true },
      { key: "wind_direction", label: "Wind direction", type: "text", required: true },
      { key: "temperature", label: "Temperature", type: "text", required: false },
      { key: "conditions", label: "Other conditions", type: "text", required: false },
      { key: "sensitive_areas", label: "Sensitive areas / buffers", type: "longtext", required: false },
      { key: "start_time", label: "Start time", type: "text", required: false },
      { key: "finish_time", label: "Finish time", type: "text", required: false },
      { key: "notes", label: "Notes", type: "longtext", required: false },
    ],
  },
  {
    id: "job_sheet",
    name: "Job sheet",
    tagline: "Proof of completion — feeds the invoice",
    promptBlock: `This is a job sheet capturing the billable facts of a completed job.
Hours may be stated as start/end or total. Quantities may be hectares, metres, loads, or units.
Chargeable extras (travel, standdown, cartage, wait time) are separate from the main job description.`,
    fields: [
      { key: "client", label: "Client", type: "text", required: true },
      { key: "job_description", label: "Job description", type: "longtext", required: true },
      { key: "hours_or_quantity", label: "Hours or quantity done", type: "text", required: true },
      { key: "equipment", label: "Machine / equipment used", type: "text", required: false },
      { key: "materials", label: "Materials / product used", type: "list", required: false },
      { key: "extras", label: "Chargeable extras", type: "list", required: false },
      { key: "delays", label: "Delays or conditions", type: "longtext", required: false },
      { key: "po_reference", label: "Client PO / job reference", type: "text", required: false },
      { key: "notes", label: "Anything unusual", type: "longtext", required: false },
    ],
  },
  {
    id: "quote",
    name: "Quote",
    tagline: "Quote on the spot, before you leave",
    promptBlock: `This is a quote/estimate. Extract line items with description, quantity, unit, and rate where stated
("mulching at four fifty a hectare, about twelve hectares" -> description "Mulching", quantity 12, unit "ha", rate 450).
Never compute totals yourself. If the speaker states an overall total, put it in stated_total exactly as said.
Exclusions ("doesn't include the gorse block") go in exclusions.`,
    fields: [
      { key: "client", label: "Client", type: "text", required: true },
      { key: "scope", label: "Scope of work", type: "longtext", required: true },
      { key: "line_items", label: "Line items", type: "lineitems", required: true },
      { key: "stated_total", label: "Total as spoken (if any)", type: "text", required: false },
      { key: "exclusions", label: "Exclusions", type: "list", required: false },
      { key: "validity", label: "Validity period", type: "text", required: false, hint: "Defaults to 30 days" },
      { key: "payment_terms", label: "Deposit / payment terms", type: "text", required: false },
    ],
    computedTotals: true,
  },
  {
    id: "site_visit",
    name: "Site visit report",
    tagline: "What I saw, what we agreed",
    promptBlock: `This is a site visit report. Preserve the speaker's structure in observations — do not reorder or summarise away detail.
Actions agreed should each carry an owner if one was stated ("they'll fix the trough, I'll send the report" -> two actions with owners).`,
    fields: [
      { key: "client", label: "Client", type: "text", required: true },
      { key: "purpose", label: "Purpose of visit", type: "text", required: false },
      { key: "people_present", label: "People present", type: "list", required: false },
      { key: "observations", label: "Observations", type: "longtext", required: true },
      { key: "actions", label: "Actions agreed (with owner)", type: "list", required: false },
      { key: "follow_up", label: "Follow-up date or trigger", type: "text", required: false },
      { key: "notes", label: "Anything unusual", type: "longtext", required: false },
    ],
  },
  {
    id: "incident",
    name: "Incident / hazard report",
    tagline: "HSWA 2015 incident record",
    promptBlock: `This is an incident/hazard report under the Health and Safety at Work Act 2015.
Use a neutral, factual register. Never speculate about cause or fault.
Location means the precise spot beyond GPS ("in the yard by the loading ramp").
If the description involves a death, an injury likely to require immediate hospital treatment, or a dangerous incident
(structural collapse, uncontrolled escape of a substance, electric shock and similar), set flags.notifiable true.`,
    fields: [
      { key: "what_happened", label: "What happened", type: "longtext", required: true },
      { key: "location", label: "Where exactly", type: "text", required: true },
      { key: "people_involved", label: "People involved / witnesses", type: "list", required: false },
      { key: "injury", label: "Injury (nature and treatment)", type: "longtext", required: false },
      { key: "immediate_actions", label: "Immediate actions taken", type: "longtext", required: false },
      { key: "hazard", label: "Hazard identified / interim controls", type: "longtext", required: false },
      { key: "corrective_actions", label: "Corrective actions proposed", type: "longtext", required: false },
      { key: "equipment", label: "Equipment / vehicles involved", type: "list", required: false },
    ],
  },
  {
    id: "claim",
    name: "Claim / warranty assessment",
    tagline: "Reported / Found / Assessment — built to be argued over",
    promptBlock: `This is a claim/warranty assessment. It is an evidentiary document.
NEVER merge what was claimed/reported (the customer's account) with what was found on inspection (direct observation).
If the transcript blends them, split conservatively and include both fields in followUps so a human reviews the split.
Any statement of probable cause is the assessor's opinion: put it only in probable_cause, never in findings.
Parts and labour go in line_items with rates where stated; never compute totals.`,
    fields: [
      { key: "client", label: "Client", type: "text", required: true },
      { key: "reference", label: "Claim / job / warranty reference", type: "text", required: false },
      { key: "asset", label: "Asset (make, model, serial, hours/km)", type: "text", required: true },
      { key: "reported_fault", label: "Reported fault (customer's account)", type: "longtext", required: true, section: "Reported" },
      { key: "findings", label: "Findings on inspection", type: "longtext", required: true, section: "Found" },
      { key: "probable_cause", label: "Probable cause (assessor's opinion)", type: "longtext", required: false, section: "Assessment" },
      { key: "service_history", label: "Service / maintenance history observed", type: "longtext", required: false, section: "Assessment" },
      { key: "line_items", label: "Parts and labour", type: "lineitems", required: false, section: "Assessment" },
      { key: "stated_total", label: "Total as spoken (if any)", type: "text", required: false, section: "Assessment" },
      { key: "recommendation", label: "Recommendation", type: "text", required: false, section: "Assessment", hint: "Approve / decline / more information" },
      { key: "people_present", label: "People present", type: "list", required: false, section: "Assessment" },
    ],
    computedTotals: true,
  },
];

export const getTemplate = (id) => TEMPLATES.find((t) => t.id === id);
