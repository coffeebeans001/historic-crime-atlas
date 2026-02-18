Data Provenance

Source

The trial records used in this project originate from the Old Bailey Proceedings Online — a publicly available digital archive of London’s central criminal court.

The dataset contains structured transcriptions of trials spanning the 17th to early 20th centuries (from 1674 onwards).
including:
Offence category
Verdict outcome
Defendant attributes
Trial date
Court location

The original archive is maintained by academic institutions and historians to preserve court records and make them accessible for research and education.

This application does not modify the historical record.
It reorganises and aggregates the data to allow spatial and temporal exploration.

Transformations Applied
To support interactive analysis, the raw records are processed before visualisation.

The following transformations occur:

1. Time Bucketing
   Individual trial dates are grouped into time periods (year or decade) to allow statistical comparison over time.

   Purpose:
   Single trials are anecdotal. Grouped trials reveal historical patterns.

2. Conviction Rate Calculation
   For each time bucket:
   conviction rate = guilty verdicts / total trials
   This allows comparison across centuries regardless of population growth.

3. Confidence Intervals (Wilson Score)
   Confidence intervals are calculated to prevent misleading interpretations when sample sizes are small.

   This is important because:
   Early historical records contain fewer surviving trials
   Some demographic groups appear less frequently in records
   Apparent spikes may otherwise look like real trends
   The interval communicates certainty, not just value.

4. Geographic Approximation
   Historic trial locations are mapped using known historical court locations.

   The map therefore shows:
   the location of the court proceeding, not necessarily the crime scene

   This preserves historical accuracy while enabling spatial exploration.

   Limitations of Historical Records
   The Old Bailey archive reflects the legal system of its time, and therefore includes structural biases.

   Examples include:
   Selective prosecution
   Unequal representation in records
   Changes in law definitions over centuries
   Survival bias in preserved documents

   For this reason, the application should be interpreted as:
   a record of judicial activity, not a direct measurement of societal behaviour

   Purpose of This Project
   The goal of this project is to make historical legal data explorable — not to draw definitive conclusions.

   It is intended for:
   Education
   Research exploration
   Public history engagement

   Users are encouraged to interpret patterns cautiously and within historical context.

   Attribution

   This project uses derived data from the Old Bailey Proceedings Online. The original records remain the property of the Old Bailey Proceedings Online Project. This application is an independent educational visualisation and is not affiliated with or endorsed by the archive.
   www.oldbaileyonline.org
   © The Old Bailey Proceedings Online Project
