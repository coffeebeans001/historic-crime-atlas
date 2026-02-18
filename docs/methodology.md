Methodology

This document describes how statistical values and geographic results in the Historic Crime Atlas are calculated.
The aim is transparency rather than mathematical complexity — methods are explained in plain language.

1. Conviction Rate Calculation

For each time period, the conviction rate is calculated as:
conviction rate = guilty verdicts / total trials
Displayed as a percentage.
Only trials with a recorded verdict are included in calculations.

2. Confidence Intervals

The chart optionally displays confidence intervals to indicate uncertainty in historical records.
We use the Wilson score interval, which is appropriate for proportions derived from limited sample sizes.
Why Wilson instead of a simple margin of error:

Historical datasets often contain small counts
Traditional normal approximations become inaccurate with small samples
Wilson intervals remain stable near 0% and 100%
In simple terms:
Wider shaded bands mean less surviving evidence for that period, not more disagreement.
This prevents early centuries from appearing artificially precise.

3. Time Bucketing
   Data can be grouped into different temporal resolutions:
   Year
   Decade

This avoids misleading volatility caused by sparse early records.
For example, one conviction in a single year may produce extreme percentages, while decade grouping shows broader historical patterns.

4. Geographic Distance
   Nearby trials are determined using the Haversine formula.
   This calculates distance over the Earth’s curvature rather than a flat map.
   Why this matters:
   London distances are small but non-linear on a globe
   Straight-line Cartesian distance would introduce positional error
   The Haversine method is standard in navigation and GIS systems
   Distances returned are measured in metres.

5. Map Clustering
   Markers are clustered dynamically to maintain readability.
   Clustering does not remove data — it only groups visually overlapping trials at lower zoom levels.
   When zoomed in, individual trials are revealed.

6. Jittering Overlapping Points
   Some trials share identical recorded coordinates.
   To prevent markers hiding each other, a very small offset (“jitter”) is applied for display purposes only.
   This does not change stored coordinates or calculated distances.

7. What the System Does Not Do
   The application does not:
   Predict crime
   Rank areas by danger
   Estimate unrecorded offences
   Apply modern legal standards to historical outcomes
   It visualises preserved court records only.

Reproducibility
All calculations are performed deterministically from the dataset.
Given the same input data, the application will always produce the same output.
